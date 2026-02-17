/*
  Simple load test for /api/chat (SSE endpoint).
  - Spawns N concurrent requests
  - Optionally aborts some requests early to validate abort-on-disconnect

  Usage:
    node scripts/load-test-chat.js --url http://localhost:3000 --concurrency 5 --requests 20
    node scripts/load-test-chat.js --url https://your-service.onrender.com --concurrency 10 --requests 100 --abortPercent 20 --abortAfterMs 300

  Notes:
  - This reads only the first few SSE events and then ends (or aborts) the request.
  - Requires Node 18+ for built-in fetch.
*/

const crypto = require('crypto');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    args[key] = val;
  }
  return args;
}

function uuidv4() {
  // good enough for test traffic
  return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runOne({ url, abortAfterMs, shouldAbort }) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const sessionId = uuidv4();

  const doAbort = async () => {
    if (!shouldAbort) return;
    await sleep(abortAfterMs);
    controller.abort();
  };

  const abortPromise = doAbort();

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: 'help me find award categories' }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, status: res.status, ms: Date.now() - startedAt };
    }

    // Read a bit of the stream then exit.
    const reader = res.body.getReader();
    let bytes = 0;
    const maxBytes = 25_000;
    while (bytes < maxBytes) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) bytes += value.length;
      // stop quickly if not aborting
      if (!shouldAbort && bytes > 5_000) break;
    }

    try { reader.cancel(); } catch {}

    await abortPromise;
    return { ok: true, status: 200, ms: Date.now() - startedAt, bytes, aborted: false };
  } catch (e) {
    const aborted = e?.name === 'AbortError';
    return { ok: aborted, status: aborted ? 'aborted' : 'error', ms: Date.now() - startedAt, aborted };
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const url = args.url || 'http://localhost:3000';
  const concurrency = parseInt(args.concurrency || '5', 10);
  const requests = parseInt(args.requests || '20', 10);
  const abortPercent = parseInt(args.abortPercent || '0', 10);
  const abortAfterMs = parseInt(args.abortAfterMs || '250', 10);

  console.log(JSON.stringify({ url, concurrency, requests, abortPercent, abortAfterMs }));

  let inFlight = 0;
  let sent = 0;
  let completed = 0;
  let ok = 0;
  let aborted = 0;
  let non200 = 0;

  const latencies = [];

  async function worker() {
    while (true) {
      const idx = sent++;
      if (idx >= requests) return;
      inFlight++;

      const shouldAbort = Math.random() * 100 < abortPercent;
      const result = await runOne({ url, abortAfterMs, shouldAbort });

      inFlight--;
      completed++;

      latencies.push(result.ms);
      if (result.aborted) aborted++;
      else if (result.ok) ok++;
      else non200++;

      if (completed % Math.max(1, Math.floor(requests / 10)) === 0) {
        console.log(
          `[progress] completed=${completed}/${requests} ok=${ok} aborted=${aborted} non200=${non200} inFlight=${inFlight}`
        );
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  latencies.sort((a, b) => a - b);
  const p = (q) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))];

  console.log(
    JSON.stringify(
      {
        requests,
        concurrency,
        ok,
        aborted,
        non200,
        latency_ms: {
          min: latencies[0],
          p50: p(0.5),
          p90: p(0.9),
          p99: p(0.99),
          max: latencies[latencies.length - 1],
        },
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

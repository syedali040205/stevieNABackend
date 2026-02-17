const { setTimeout: sleep } = require('timers/promises');

async function postSse(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  // naive parse: find first data: line
  const lines = text.split(/\r?\n/);
  const dataLines = lines.filter((l) => l.startsWith('data: '));
  const events = dataLines.map((l) => {
    try {
      return JSON.parse(l.slice(6));
    } catch {
      return null;
    }
  }).filter(Boolean);
  return { status: res.status, events, raw: text };
}

async function main() {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  const url = `${base.replace(/\/$/, '')}/api/chat`;
  const session_id = '11111111-1111-1111-1111-111111111111';

  const steps = [
    { message: 'hi', expectIncludes: "What's your name" },
    { message: 'Jane Doe', expectIncludes: 'email address' },
    { message: 'jane@example.com', expectIncludes: 'Who are you nominating' },
    { message: 'a team', expectIncludes: 'Where are you based' },
    { message: 'Dubai, UAE', expectIncludes: 'how many people' },
    { message: '3', expectIncludes: 'how big is the overall company' },
    { message: '45', expectIncludes: 'Tell me about the achievement' },
    { message: 'We built an AI concierge that reduced support wait times by 30% and improved CSAT.', expectIncludes: 'measurable impact' },
    { message: 'skip.', expectIncludes: 'innovative or unique' },
    { message: 'We combined retrieval + agentic workflows to resolve tickets autonomously.', expectIncludes: 'challenges you overcame' },
    { message: "don't know", expectEventType: 'recommendations' },
  ];

  const results = [];
  for (const [i, s] of steps.entries()) {
    const r = await postSse(url, { session_id, message: s.message });
    const firstChunk = r.events.find((e) => e.type === 'chunk')?.content;
    const hasRecommendations = r.events.some((e) => e.type === 'recommendations');

    results.push({
      i: i + 1,
      status: r.status,
      message: s.message,
      firstChunk: firstChunk ? firstChunk.slice(0, 140) : null,
      eventTypes: Array.from(new Set(r.events.map((e) => e.type))),
      hasRecommendations,
    });

    if (s.expectIncludes) {
      if (!firstChunk || !firstChunk.toLowerCase().includes(s.expectIncludes.toLowerCase())) {
        throw new Error(`Step ${i + 1} expected chunk to include "${s.expectIncludes}" but got: ${firstChunk}`);
      }
    }
    if (s.expectEventType === 'recommendations') {
      if (!hasRecommendations) {
        throw new Error(`Step ${i + 1} expected recommendations event but got types: ${r.events.map((e) => e.type).join(',')}`);
      }
    }

    // tiny pause so logs stay readable
    await sleep(50);
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Calls the API to run session cleanup (delete expired user_sessions).
 * Use from cron or manually. Loads .env from api/ if present.
 *
 * Env: API_URL (default http://localhost:3000), INTERNAL_API_KEY
 * Cron example (every 15 min): */15 * * * * cd /path/to/NA/api && node scripts/run-session-cleanup.js
 */

const path = require('path');
const fs = require('fs');

// Load .env from api/ if it exists
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const API_URL = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!INTERNAL_API_KEY) {
  console.error('INTERNAL_API_KEY is not set. Set it in .env or the environment.');
  process.exit(1);
}

const url = `${API_URL}/api/internal/cleanup-sessions`;

fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${INTERNAL_API_KEY}`,
    'Content-Type': 'application/json',
  },
})
  .then((res) => res.json())
  .then((body) => {
    if (body.success !== true) {
      console.error('Cleanup failed:', body.message || body);
      process.exit(1);
    }
    console.log(`OK deleted_count=${body.deleted_count}`);
  })
  .catch((err) => {
    console.error('Request failed:', err.message);
    process.exit(1);
  });

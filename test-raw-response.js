const https = require('https');

const sessionId = 'b4e8a8fa-0a25-4fa2-9ee5-c8f70ef3d085';
const message = 'Hello';

const postData = JSON.stringify({
  session_id: sessionId,
  message: message,
});

const options = {
  hostname: 'stevienabackend.onrender.com',
  port: 443,
  path: '/api/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
};

console.log('Sending request...\n');

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  console.log('\nRaw response:\n');
  console.log('─'.repeat(70));
  
  res.on('data', (chunk) => {
    process.stdout.write(chunk.toString());
  });
  
  res.on('end', () => {
    console.log('\n' + '─'.repeat(70));
    console.log('\nStream ended');
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(postData);
req.end();

setTimeout(() => {
  console.log('\nTimeout - closing');
  process.exit(0);
}, 30000);

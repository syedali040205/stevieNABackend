console.log('Starting test...');

const axios = require('./api/node_modules/axios');

async function test() {
  console.log('Making request...');
  
  const response = await axios.post(
    'http://localhost:3000/api/chatbot/ask',
    { question: "What are the Stevie Awards?" },
    { responseType: 'stream', timeout: 60000 }
  );
  
  console.log('Got response, listening to stream...');
  
  response.data.on('data', (chunk) => {
    console.log('Chunk:', chunk.toString());
  });
  
  response.data.on('end', () => {
    console.log('Stream ended');
  });
}

test().catch(err => console.error('Error:', err.message));

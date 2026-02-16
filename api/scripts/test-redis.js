/**
 * Redis Integration Test Script
 * 
 * Tests all Redis functionality:
 * - Connection
 * - Embedding cache
 * - Rate limiting
 * - Session cache
 * 
 * Usage: node scripts/test-redis.js
 */

const Redis = require('ioredis');
const crypto = require('crypto');

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'strongpassword123';

console.log('🔧 Redis Integration Test\n');
console.log('Configuration:');
console.log(`  URL: ${REDIS_URL}`);
console.log(`  Password: ${REDIS_PASSWORD ? '***' : 'none'}\n`);

// Create Redis client
const redis = new Redis(REDIS_URL, {
  password: REDIS_PASSWORD || undefined,
  connectTimeout: 5000,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 50, 2000);
  },
});

let testsPassed = 0;
let testsFailed = 0;

function pass(testName) {
  console.log(`✅ ${testName}`);
  testsPassed++;
}

function fail(testName, error) {
  console.log(`❌ ${testName}: ${error}`);
  testsFailed++;
}

async function runTests() {
  try {
    // Test 1: Connection
    console.log('Test 1: Connection');
    const pong = await redis.ping();
    if (pong === 'PONG') {
      pass('Redis connection successful');
    } else {
      fail('Redis connection', 'Expected PONG, got ' + pong);
    }

    // Test 2: Basic operations
    console.log('\nTest 2: Basic Operations');
    await redis.set('test:basic', 'hello', 'EX', 10);
    const value = await redis.get('test:basic');
    if (value === 'hello') {
      pass('Set and get operations');
    } else {
      fail('Set and get operations', 'Expected "hello", got ' + value);
    }

    // Test 3: Embedding cache format
    console.log('\nTest 3: Embedding Cache');
    const text = 'test embedding text';
    const model = 'text-embedding-3-small';
    const normalized = text.trim().toLowerCase();
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    const embeddingKey = `emb:${model}:${hash}`;
    
    const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
    await redis.setex(embeddingKey, 7 * 24 * 3600, JSON.stringify(mockEmbedding));
    
    const cachedEmbedding = await redis.get(embeddingKey);
    if (cachedEmbedding) {
      const parsed = JSON.parse(cachedEmbedding);
      if (parsed.length === 1536) {
        pass('Embedding cache (1536 dimensions)');
      } else {
        fail('Embedding cache', `Expected 1536 dimensions, got ${parsed.length}`);
      }
    } else {
      fail('Embedding cache', 'Failed to retrieve cached embedding');
    }

    // Test 4: Rate limiting
    console.log('\nTest 4: Rate Limiting');
    const rateLimitKey = 'rate:test-ip:/api/test';
    await redis.del(rateLimitKey); // Clean up first
    
    const count1 = await redis.incr(rateLimitKey);
    await redis.expire(rateLimitKey, 60);
    const count2 = await redis.incr(rateLimitKey);
    
    if (count1 === 1 && count2 === 2) {
      pass('Rate limiting (atomic INCR)');
    } else {
      fail('Rate limiting', `Expected counts 1 and 2, got ${count1} and ${count2}`);
    }

    const ttl = await redis.ttl(rateLimitKey);
    if (ttl > 0 && ttl <= 60) {
      pass('Rate limiting TTL (60 seconds)');
    } else {
      fail('Rate limiting TTL', `Expected TTL 1-60, got ${ttl}`);
    }

    // Test 5: Session cache
    console.log('\nTest 5: Session Cache');
    const sessionId = 'test-session-123';
    const sessionKey = `sess:${sessionId}`;
    const sessionData = {
      user_context: { user_name: 'Test User' },
      conversation_history: [],
    };
    
    await redis.setex(sessionKey, 3600, JSON.stringify(sessionData));
    const cachedSession = await redis.get(sessionKey);
    
    if (cachedSession) {
      const parsed = JSON.parse(cachedSession);
      if (parsed.user_context.user_name === 'Test User') {
        pass('Session cache (1 hour TTL)');
      } else {
        fail('Session cache', 'Session data mismatch');
      }
    } else {
      fail('Session cache', 'Failed to retrieve cached session');
    }

    // Test 6: Key expiration
    console.log('\nTest 6: Key Expiration');
    await redis.set('test:expire', 'value', 'EX', 1);
    const exists1 = await redis.exists('test:expire');
    await new Promise(resolve => setTimeout(resolve, 1100));
    const exists2 = await redis.exists('test:expire');
    
    if (exists1 === 1 && exists2 === 0) {
      pass('Key expiration (TTL)');
    } else {
      fail('Key expiration', `Expected exists=1 then 0, got ${exists1} then ${exists2}`);
    }

    // Test 7: Pattern deletion
    console.log('\nTest 7: Pattern Deletion');
    await redis.set('test:pattern:1', 'value1');
    await redis.set('test:pattern:2', 'value2');
    await redis.set('test:pattern:3', 'value3');
    
    const keys = [];
    const stream = redis.scanStream({ match: 'test:pattern:*', count: 100 });
    for await (const batch of stream) {
      keys.push(...batch);
    }
    
    if (keys.length >= 3) {
      pass('Pattern scanning (SCAN)');
    } else {
      fail('Pattern scanning', `Expected 3+ keys, found ${keys.length}`);
    }
    
    await redis.del(...keys);
    const remainingKeys = [];
    const stream2 = redis.scanStream({ match: 'test:pattern:*', count: 100 });
    for await (const batch of stream2) {
      remainingKeys.push(...batch);
    }
    
    if (remainingKeys.length === 0) {
      pass('Pattern deletion (DEL)');
    } else {
      fail('Pattern deletion', `Expected 0 keys, found ${remainingKeys.length}`);
    }

    // Cleanup
    console.log('\nCleaning up test keys...');
    await redis.del('test:basic', embeddingKey, rateLimitKey, sessionKey);
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    testsFailed++;
  } finally {
    await redis.quit();
    
    console.log('\n' + '='.repeat(50));
    console.log('Test Results:');
    console.log(`  ✅ Passed: ${testsPassed}`);
    console.log(`  ❌ Failed: ${testsFailed}`);
    console.log('='.repeat(50));
    
    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed! Redis integration is working correctly.\n');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. Check Redis configuration.\n');
      process.exit(1);
    }
  }
}

// Handle errors
redis.on('error', (error) => {
  console.error('❌ Redis connection error:', error.message);
  process.exit(1);
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis\n');
  runTests();
});

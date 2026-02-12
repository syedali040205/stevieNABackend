/**
 * Test Production Redis Connection
 * 
 * This script tests your production Redis setup to ensure:
 * - Connection is successful
 * - Read/write operations work
 * - TTL is working correctly
 * - Performance is acceptable
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { cacheManager } from './src/services/cacheManager';

async function testProductionRedis() {
  console.log('🧪 Testing Production Redis Connection\n');
  console.log('📍 Redis URL:', process.env.REDIS_URL?.replace(/:[^:@]+@/, ':****@') || 'Not set');
  console.log();

  const startTime = Date.now();

  try {
    // Test 1: Health Check
    console.log('1️⃣  Health Check...');
    const healthStart = Date.now();
    const isHealthy = await cacheManager.healthCheck();
    const healthTime = Date.now() - healthStart;
    
    if (!isHealthy) {
      throw new Error('Redis health check failed - cannot connect to Redis');
    }
    
    console.log(`   ✅ Health: OK (${healthTime}ms)`);
    console.log();

    // Test 2: Write Performance
    console.log('2️⃣  Write Test...');
    const writeStart = Date.now();
    const testKey = `test:production:${Date.now()}`;
    const testValue = {
      message: 'Hello from production!',
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development',
    };
    
    const writeSuccess = await cacheManager.set(testKey, testValue, 60);
    const writeTime = Date.now() - writeStart;
    
    if (!writeSuccess) {
      throw new Error('Write operation failed');
    }
    
    console.log(`   ✅ Write successful (${writeTime}ms)`);
    console.log('   Key:', testKey);
    console.log('   Value:', JSON.stringify(testValue, null, 2));
    console.log();

    // Test 3: Read Performance
    console.log('3️⃣  Read Test...');
    const readStart = Date.now();
    const retrieved = await cacheManager.get(testKey);
    const readTime = Date.now() - readStart;
    
    if (!retrieved) {
      throw new Error('Read operation failed - key not found');
    }
    
    console.log(`   ✅ Read successful (${readTime}ms)`);
    console.log('   Retrieved:', JSON.stringify(retrieved, null, 2));
    console.log();

    // Test 4: Data Integrity
    console.log('4️⃣  Data Integrity Check...');
    const isMatch = JSON.stringify(testValue) === JSON.stringify(retrieved);
    
    if (!isMatch) {
      throw new Error('Data integrity check failed - retrieved data does not match');
    }
    
    console.log('   ✅ Data integrity verified');
    console.log();

    // Test 5: TTL Check
    console.log('5️⃣  TTL Test...');
    const ttl = await cacheManager.ttl(testKey);
    
    if (ttl < 0) {
      throw new Error('TTL check failed - key has no expiry');
    }
    
    console.log(`   ✅ TTL: ${ttl} seconds (expected: ~60)`);
    console.log();

    // Test 6: Exists Check
    console.log('6️⃣  Exists Test...');
    const exists = await cacheManager.exists(testKey);
    
    if (!exists) {
      throw new Error('Exists check failed - key should exist');
    }
    
    console.log('   ✅ Key exists');
    console.log();

    // Test 7: Delete Operation
    console.log('7️⃣  Delete Test...');
    const deleteSuccess = await cacheManager.delete(testKey);
    
    if (!deleteSuccess) {
      throw new Error('Delete operation failed');
    }
    
    console.log('   ✅ Key deleted');
    console.log();

    // Test 8: Verify Deletion
    console.log('8️⃣  Verify Deletion...');
    const existsAfterDelete = await cacheManager.exists(testKey);
    
    if (existsAfterDelete) {
      throw new Error('Verification failed - key still exists after deletion');
    }
    
    console.log('   ✅ Deletion verified');
    console.log();

    // Test 9: Bulk Operations
    console.log('9️⃣  Bulk Operations Test...');
    const bulkKeys = [
      `test:bulk:1:${Date.now()}`,
      `test:bulk:2:${Date.now()}`,
      `test:bulk:3:${Date.now()}`,
    ];
    
    const bulkStart = Date.now();
    await Promise.all(
      bulkKeys.map((key, index) =>
        cacheManager.set(key, { index, value: `test-${index}` }, 60)
      )
    );
    const bulkTime = Date.now() - bulkStart;
    
    console.log(`   ✅ Bulk write successful (${bulkTime}ms for 3 keys)`);
    console.log(`   Average: ${(bulkTime / 3).toFixed(2)}ms per key`);
    
    // Cleanup bulk keys
    await Promise.all(bulkKeys.map(key => cacheManager.delete(key)));
    console.log('   ✅ Bulk cleanup successful');
    console.log();

    // Performance Summary
    const totalTime = Date.now() - startTime;
    console.log('📊 Performance Summary:');
    console.log(`   Health check: ${healthTime}ms`);
    console.log(`   Write: ${writeTime}ms`);
    console.log(`   Read: ${readTime}ms`);
    console.log(`   Total test time: ${totalTime}ms`);
    console.log();

    // Performance Assessment
    console.log('🎯 Performance Assessment:');
    if (readTime < 10) {
      console.log('   ✅ Excellent - Read time < 10ms');
    } else if (readTime < 50) {
      console.log('   ✅ Good - Read time < 50ms');
    } else if (readTime < 100) {
      console.log('   ⚠️  Acceptable - Read time < 100ms');
    } else {
      console.log('   ❌ Slow - Read time > 100ms (consider closer region)');
    }
    console.log();

    console.log('✅ All tests passed! Production Redis is ready.\n');
    console.log('🚀 Next steps:');
    console.log('   1. Update production environment variables');
    console.log('   2. Deploy your application');
    console.log('   3. Monitor cache hit rates');
    console.log('   4. Set up alerts for Redis downtime');
    console.log();

    await cacheManager.close();
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error();
    console.error('🔧 Troubleshooting:');
    console.error('   1. Check REDIS_URL is correct in .env');
    console.error('   2. Verify Redis server is running');
    console.error('   3. Check firewall allows port 6379');
    console.error('   4. Verify REDIS_PASSWORD is correct');
    console.error('   5. Check network connectivity to Redis server');
    console.error();
    
    await cacheManager.close();
    process.exit(1);
  }
}

testProductionRedis();

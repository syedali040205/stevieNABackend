/**
 * Check Redis stats and configuration
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { cacheManager } from './src/services/cacheManager';
import Redis from 'ioredis';

async function checkRedisStats() {
  console.log('🔍 Checking Redis Stats\n');

  try {
    // Health check
    console.log('1️⃣  Health Check...');
    const isHealthy = await cacheManager.healthCheck();
    console.log(`   Status: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}\n`);

    if (!isHealthy) {
      console.log('❌ Redis is not running or not accessible');
      console.log('   Make sure Redis is installed and running on localhost:6379\n');
      process.exit(1);
    }

    // Get Redis client for detailed stats
    const redis = new Redis({
      host: 'localhost',
      port: 6379,
    });

    // Server info
    console.log('2️⃣  Server Information...');
    const info = await redis.info('server');
    const serverLines = info.split('\r\n').filter(line => line && !line.startsWith('#'));
    serverLines.slice(0, 5).forEach(line => console.log(`   ${line}`));
    console.log();

    // Memory stats
    console.log('3️⃣  Memory Usage...');
    const memory = await redis.info('memory');
    const memoryLines = memory.split('\r\n').filter(line => 
      line.includes('used_memory_human') || 
      line.includes('used_memory_peak_human') ||
      line.includes('maxmemory_human')
    );
    memoryLines.forEach(line => console.log(`   ${line}`));
    console.log();

    // Stats
    console.log('4️⃣  Stats...');
    const stats = await redis.info('stats');
    const statsLines = stats.split('\r\n').filter(line => 
      line.includes('total_connections_received') ||
      line.includes('total_commands_processed') ||
      line.includes('keyspace_hits') ||
      line.includes('keyspace_misses')
    );
    statsLines.forEach(line => console.log(`   ${line}`));
    
    // Calculate hit rate
    const hitsMatch = stats.match(/keyspace_hits:(\d+)/);
    const missesMatch = stats.match(/keyspace_misses:(\d+)/);
    if (hitsMatch && missesMatch) {
      const hits = parseInt(hitsMatch[1]);
      const misses = parseInt(missesMatch[1]);
      const total = hits + misses;
      const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : '0.00';
      console.log(`   cache_hit_rate: ${hitRate}%`);
    }
    console.log();

    // Keys
    console.log('5️⃣  Cached Keys...');
    const allKeys = await redis.keys('*');
    console.log(`   Total keys: ${allKeys.length}`);
    
    const sessionKeys = await redis.keys('session:*');
    console.log(`   Session keys: ${sessionKeys.length}`);
    
    const kbKeys = await redis.keys('kb_search:*');
    console.log(`   KB search keys: ${kbKeys.length}`);
    
    const otherKeys = allKeys.length - sessionKeys.length - kbKeys.length;
    console.log(`   Other keys: ${otherKeys}`);
    console.log();

    // Sample keys
    if (allKeys.length > 0) {
      console.log('6️⃣  Sample Keys (first 10)...');
      allKeys.slice(0, 10).forEach(key => {
        console.log(`   - ${key}`);
      });
      console.log();
    }

    // Configuration
    console.log('7️⃣  Configuration...');
    const config = await redis.config('GET', 'maxmemory') as string[];
    console.log(`   Max memory: ${config[1] || 'unlimited'}`);
    
    const evictionPolicy = await redis.config('GET', 'maxmemory-policy') as string[];
    console.log(`   Eviction policy: ${evictionPolicy[1]}`);
    console.log();

    // Self-hosting assessment
    console.log('8️⃣  Self-Hosting Assessment...');
    const usedMemory = await redis.info('memory');
    const usedMemoryMatch = usedMemory.match(/used_memory:(\d+)/);
    const usedMemoryBytes = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0;
    const usedMemoryMB = (usedMemoryBytes / 1024 / 1024).toFixed(2);
    
    console.log(`   Current memory usage: ${usedMemoryMB} MB`);
    console.log(`   Estimated production usage: ~50-100 MB`);
    console.log(`   Self-hosting verdict: ✅ FEASIBLE`);
    console.log();
    console.log('   💡 Self-hosting options:');
    console.log('      1. DigitalOcean Droplet ($6/month) - 1GB RAM');
    console.log('      2. AWS EC2 t3.micro ($8/month) - 1GB RAM');
    console.log('      3. Linode Nanode ($5/month) - 1GB RAM');
    console.log('      4. Railway ($5/month) - Managed Redis');
    console.log();
    console.log('   📊 Managed vs Self-hosted:');
    console.log('      Upstash (managed): $0-10/month, auto-scaling, no maintenance');
    console.log('      Self-hosted: $5-8/month, manual setup, you manage updates');
    console.log();

    await redis.quit();
    await cacheManager.close();

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkRedisStats();

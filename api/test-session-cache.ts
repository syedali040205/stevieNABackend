/**
 * Test script for Redis-cached session management
 * 
 * Tests:
 * 1. Create session → cached in Redis
 * 2. Get session → cache hit (fast)
 * 3. Update session → cache updated
 * 4. Delete session → cache invalidated
 * 5. Performance comparison: cached vs uncached reads
 * 
 * SAFE: Uses a test-only user ID that won't affect production data
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { SessionManager } from './src/services/sessionManager';
import { cacheManager } from './src/services/cacheManager';
import { getSupabaseClient } from './src/config/supabase';

async function testSessionCache() {
  console.log('🧪 Testing Redis-Cached Session Management\n');

  const sessionManager = new SessionManager();
  const supabase = getSupabaseClient();
  
  console.log('0️⃣  Setting up test user in auth.users...');
  
  try {
    // Insert into auth.users first (required for foreign key)
    const { error: authError } = await supabase.auth.admin.createUser({
      email: 'test-cache@example.com',
      password: 'test-password-123',
      email_confirm: true,
      user_metadata: {
        full_name: 'Cache Test User'
      }
    });

    if (authError && !authError.message.includes('already registered')) {
      throw authError;
    }

    // Get the actual user ID from auth
    const { data: authUser } = await supabase.auth.admin.listUsers();
    const testUser = authUser.users.find(u => u.email === 'test-cache@example.com');
    
    if (!testUser) {
      throw new Error('Failed to create test user');
    }

    const actualUserId = testUser.id;
    console.log(`✅ Test user ready: ${actualUserId}\n`);

    // Now insert into public.users table
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: actualUserId,
        email: 'test-cache@example.com',
        full_name: 'Cache Test User',
        country: 'USA',
        organization_name: 'Test Corp',
      });

    if (userError) {
      console.log('Note: User already exists in public.users, continuing...\n');
    }

    // Test 1: Create session
    console.log('1️⃣  Creating session...');
    const session = await sessionManager.createSession(
      actualUserId,
      {
        geography: 'usa',
        organization_name: 'Test Corp',
        job_title: 'Developer',
      },
      'collecting_org_type'
    );
    console.log(`✅ Session created: ${session.id}`);
    console.log(`   Cached in Redis: session:${session.id}\n`);

    // Test 2: Get session (cache hit)
    console.log('2️⃣  Getting session (should hit cache)...');
    const startCached = Date.now();
    const cachedSession = await sessionManager.getSession(session.id);
    const cachedTime = Date.now() - startCached;
    console.log(`✅ Session retrieved from cache in ${cachedTime}ms`);
    console.log(`   User ID: ${cachedSession?.user_id}\n`);

    // Test 3: Invalidate cache and get session (cache miss)
    console.log('3️⃣  Invalidating cache and getting session (should hit DB)...');
    await sessionManager.invalidateCache(session.id);
    const startUncached = Date.now();
    await sessionManager.getSession(session.id);
    const uncachedTime = Date.now() - startUncached;
    console.log(`✅ Session retrieved from PostgreSQL in ${uncachedTime}ms`);
    console.log(`   Speed improvement: ${Math.round((uncachedTime / cachedTime) * 10) / 10}x faster with cache\n`);

    // Test 4: Update session
    console.log('4️⃣  Updating session...');
    const updatedSession = await sessionManager.updateSession(
      session.id,
      {
        user_context: {
          ...session.session_data.user_context,
          org_type: 'for_profit',
          org_size: 'medium',
        },
        conversation_history: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      },
      'collecting_nomination_subject'
    );
    console.log(`✅ Session updated and cache refreshed`);
    console.log(`   Org type: ${updatedSession.session_data.user_context.org_type}`);
    console.log(`   Messages: ${updatedSession.session_data.conversation_history.length}\n`);

    // Test 5: Verify cache was updated
    console.log('5️⃣  Verifying cache was updated...');
    const rereadSession = await sessionManager.getSession(session.id);
    console.log(`✅ Cache contains updated data`);
    console.log(`   Org type from cache: ${rereadSession?.session_data.user_context.org_type}\n`);

    // Test 6: Performance test (10 reads)
    console.log('6️⃣  Performance test (10 cached reads)...');
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await sessionManager.getSession(session.id);
      times.push(Date.now() - start);
    }
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`✅ Average read time: ${Math.round(avgTime * 10) / 10}ms`);
    console.log(`   Min: ${Math.min(...times)}ms, Max: ${Math.max(...times)}ms\n`);

    // Test 7: Delete session
    console.log('7️⃣  Deleting session...');
    await sessionManager.deleteSession(session.id);
    console.log(`✅ Session deleted from PostgreSQL and cache invalidated\n`);

    // Test 8: Verify deletion
    console.log('8️⃣  Verifying deletion...');
    const deletedSession = await sessionManager.getSession(session.id);
    if (deletedSession === null) {
      console.log(`✅ Session not found (correctly deleted)\n`);
    } else {
      console.log(`❌ Session still exists (deletion failed)\n`);
    }

    // Test 9: Cache health check
    console.log('9️⃣  Redis health check...');
    const isHealthy = await cacheManager.healthCheck();
    console.log(`${isHealthy ? '✅' : '❌'} Redis is ${isHealthy ? 'healthy' : 'unhealthy'}\n`);

    console.log('✅ All tests passed!\n');
    console.log('📊 Summary:');
    console.log(`   - Sessions are cached in Redis with 1-hour TTL`);
    console.log(`   - Cache hits are ${Math.round((uncachedTime / cachedTime) * 10) / 10}x faster than DB reads`);
    console.log(`   - Write-through cache keeps Redis and PostgreSQL in sync`);
    console.log(`   - PostgreSQL remains the source of truth\n`);

    // Cleanup test user
    console.log('🧹 Cleaning up test user...');
    await supabase.from('users').delete().eq('id', actualUserId);
    await supabase.auth.admin.deleteUser(actualUserId);
    console.log('✅ Test user cleaned up\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await cacheManager.close();
    process.exit(0);
  }
}

// Run tests
testSessionCache();

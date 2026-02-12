import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../config/supabase';
import { cacheManager } from './cacheManager';
import logger from '../utils/logger';

/**
 * UserContext structure extracted from conversation
 * Pre-populated fields come from user profile
 */
export interface UserContext {
  // Pre-populated from user profile
  geography: string;
  organization_name: string;
  job_title?: string;
  
  // Extracted from AI conversation
  operating_scope?: 'local' | 'national' | 'regional' | 'global';
  org_type?: 'for_profit' | 'non_profit' | 'government' | 'education';
  org_size?: 'small' | 'medium' | 'large';
  nomination_subject?: 'company' | 'individual' | 'team' | 'product';
  achievement_focus?: string[];
  tech_orientation?: string;
  description?: string;
}

/**
 * Message in conversation history
 */
export interface Message {
  role: 'assistant' | 'user';
  content: string;
}

/**
 * Session data stored in JSONB column
 */
export interface SessionData {
  user_context: UserContext;
  conversation_history: Message[];
}

/**
 * Complete session record from database
 */
export interface Session {
  id: string;
  user_id: string;
  session_data: SessionData;
  conversation_state: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

/**
 * Conversation state enum
 */
export type ConversationState = 
  | 'collecting_geography'
  | 'collecting_org_type'
  | 'collecting_org_size'
  | 'collecting_nomination_subject'
  | 'collecting_achievement_focus'
  | 'collecting_description'
  | 'ready_for_recommendations'
  | 'complete';

/**
 * Session Manager for handling conversation sessions in Supabase
 * Implements CRUD operations with automatic expiry handling (1 hour TTL)
 * 
 * Caching Strategy (Write-Through Cache):
 * - PostgreSQL: Source of truth, persistence
 * - Redis: Fast read cache (10-100x faster)
 * - Read: Redis → PostgreSQL (cache miss) → cache result
 * - Write: PostgreSQL → Redis (update cache)
 * - Delete: PostgreSQL → Redis (invalidate cache)
 */
export class SessionManager {
  private client: SupabaseClient;
  private readonly SESSION_TTL_MS = 3600000; // 1 hour in milliseconds
  private readonly CACHE_PREFIX = 'session:';
  private readonly CACHE_TTL = 3600; // 1 hour in seconds (matches session TTL)

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  /**
   * Get Redis cache key for session
   */
  private getCacheKey(sessionId: string): string {
    return `${this.CACHE_PREFIX}${sessionId}`;
  }

  /**
   * Create a new session with initial UserContext
   * @param userId - User ID from auth
   * @param initialContext - Pre-populated UserContext from user profile
   * @param initialState - Initial conversation state (default: 'collecting_org_type')
   * @returns Created session with ID
   */
  async createSession(
    userId: string,
    initialContext: UserContext,
    initialState: ConversationState = 'collecting_org_type'
  ): Promise<Session> {
    const expiresAt = new Date(Date.now() + this.SESSION_TTL_MS);

    const { data, error } = await this.client
      .from('user_sessions')
      .insert({
        user_id: userId,
        session_data: {
          user_context: initialContext,
          conversation_history: []
        },
        conversation_state: initialState,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    if (!data) {
      throw new Error('Failed to create session: No data returned');
    }

    const session = data as Session;

    // Cache the new session in Redis
    const cacheKey = this.getCacheKey(session.id);
    await cacheManager.set(cacheKey, session, this.CACHE_TTL);
    
    logger.info('session_created_and_cached', { 
      session_id: session.id,
      user_id: userId 
    });

    return session;
  }

  /**
   * Retrieve a session by ID
   * Uses Redis cache for fast reads, falls back to PostgreSQL on cache miss
   * @param sessionId - Session UUID
   * @returns Session if found and not expired, null otherwise
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const cacheKey = this.getCacheKey(sessionId);

    // Try Redis cache first
    const cachedSession = await cacheManager.get<Session>(cacheKey);
    if (cachedSession) {
      logger.debug('session_cache_hit', { session_id: sessionId });
      return cachedSession;
    }

    logger.debug('session_cache_miss', { session_id: sessionId });

    // Cache miss - fetch from PostgreSQL
    const { data, error } = await this.client
      .from('user_sessions')
      .select('*')
      .eq('id', sessionId)
      .gt('expires_at', new Date().toISOString()) // Only get non-expired sessions
      .single();

    if (error) {
      // Session not found or expired
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to retrieve session: ${error.message}`);
    }

    const session = data as Session;

    // Cache the session for future reads
    await cacheManager.set(cacheKey, session, this.CACHE_TTL);
    
    logger.info('session_fetched_and_cached', { session_id: sessionId });

    return session;
  }

  /**
   * Update session with new UserContext and conversation history
   * Updates PostgreSQL and Redis cache
   * @param sessionId - Session UUID
   * @param sessionData - Updated session data
   * @param conversationState - Updated conversation state
   * @returns Updated session
   */
  async updateSession(
    sessionId: string,
    sessionData: SessionData,
    conversationState: ConversationState
  ): Promise<Session> {
    const { data, error } = await this.client
      .from('user_sessions')
      .update({
        session_data: sessionData,
        conversation_state: conversationState,
        // updated_at is automatically set by trigger
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }

    if (!data) {
      throw new Error('Failed to update session: No data returned');
    }

    const session = data as Session;

    // Update cache with new session data
    const cacheKey = this.getCacheKey(sessionId);
    await cacheManager.set(cacheKey, session, this.CACHE_TTL);
    
    logger.debug('session_updated_and_cached', { session_id: sessionId });

    return session;
  }

  /**
   * Delete a session (e.g., after recommendations are delivered)
   * Removes from PostgreSQL and invalidates Redis cache
   * @param sessionId - Session UUID
   * @returns True if deleted successfully
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const { error } = await this.client
      .from('user_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to delete session: ${error.message}`);
    }

    // Invalidate cache
    const cacheKey = this.getCacheKey(sessionId);
    await cacheManager.delete(cacheKey);
    
    logger.info('session_deleted_and_cache_invalidated', { session_id: sessionId });

    return true;
  }

  /**
   * Get all active sessions for a user
   * @param userId - User UUID
   * @returns Array of active sessions
   */
  async getUserSessions(userId: string): Promise<Session[]> {
    const { data, error } = await this.client
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to retrieve user sessions: ${error.message}`);
    }

    return (data as Session[]) || [];
  }

  /**
   * Cleanup expired sessions
   * @returns Number of sessions deleted
   */
  async cleanupExpiredSessions(): Promise<number> {
    const { data, error } = await this.client
      .rpc('cleanup_expired_sessions');

    if (error) {
      throw new Error(`Failed to cleanup expired sessions: ${error.message}`);
    }

    // RPC returns array with single object containing deleted_count
    return data?.[0]?.deleted_count || 0;
  }

  /**
   * Check if session storage is healthy
   * @returns True if can read/write to sessions table
   */
  async checkHealth(): Promise<boolean> {
    try {
      // Try to query sessions table
      const { error } = await this.client
        .from('user_sessions')
        .select('id')
        .limit(1);

      return !error;
    } catch (error) {
      console.error('Session storage health check failed:', error);
      return false;
    }
  }

  /**
   * Extend session expiry by 1 hour
   * Updates PostgreSQL and Redis cache
   * @param sessionId - Session UUID
   * @returns Updated session
   */
  async extendSession(sessionId: string): Promise<Session> {
    const newExpiresAt = new Date(Date.now() + this.SESSION_TTL_MS);

    const { data, error } = await this.client
      .from('user_sessions')
      .update({
        expires_at: newExpiresAt.toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to extend session: ${error.message}`);
    }

    if (!data) {
      throw new Error('Failed to extend session: No data returned');
    }

    const session = data as Session;

    // Update cache with extended expiry
    const cacheKey = this.getCacheKey(sessionId);
    await cacheManager.set(cacheKey, session, this.CACHE_TTL);
    
    logger.info('session_extended_and_cached', { session_id: sessionId });

    return session;
  }

  /**
   * Invalidate cache for a specific session
   * Useful when you want to force a fresh read from PostgreSQL
   * @param sessionId - Session UUID
   */
  async invalidateCache(sessionId: string): Promise<void> {
    const cacheKey = this.getCacheKey(sessionId);
    await cacheManager.delete(cacheKey);
    logger.debug('session_cache_invalidated', { session_id: sessionId });
  }

  /**
   * Invalidate all session caches
   * Useful for maintenance or when you need to clear all cached sessions
   */
  async invalidateAllCaches(): Promise<number> {
    const pattern = `${this.CACHE_PREFIX}*`;
    const deletedCount = await cacheManager.deletePattern(pattern);
    logger.info('all_session_caches_invalidated', { count: deletedCount });
    return deletedCount;
  }
}

// Export singleton instance - lazy initialization
let _sessionManager: SessionManager | null = null;

export const getSessionManager = (): SessionManager => {
  if (!_sessionManager) {
    _sessionManager = new SessionManager();
  }
  return _sessionManager;
};

// For backward compatibility
export const sessionManager = getSessionManager();

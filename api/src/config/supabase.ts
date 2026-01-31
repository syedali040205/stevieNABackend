import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Environment variable validation schema
const supabaseConfigSchema = z.object({
  SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Supabase service role key is required'),
});

// Validate environment variables
const validateSupabaseConfig = () => {
  try {
    return supabaseConfigSchema.parse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Supabase configuration validation failed: ${messages}`);
    }
    throw error;
  }
};

// Supabase client configuration with connection pooling
let supabaseClient: SupabaseClient | null = null;

/**
 * Get or create Supabase client instance with connection pooling
 * Implements singleton pattern for efficient connection management
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (supabaseClient) {
    return supabaseClient;
  }

  const config = validateSupabaseConfig();

  // Create Supabase client with connection pooling configuration
  supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-application-name': 'stevie-awards-api',
      },
    },
  });

  return supabaseClient;
};

/**
 * Check database connection health
 * @returns Promise<boolean> - true if connection is healthy, false otherwise
 */
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    const client = getSupabaseClient();
    
    // Simple query to verify database connectivity
    const { error } = await client
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Database health check failed:', error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Database health check error:', error);
    return false;
  }
};

/**
 * Close Supabase client connection (for graceful shutdown)
 */
export const closeSupabaseConnection = () => {
  if (supabaseClient) {
    // Supabase client doesn't have explicit close method
    // Set to null to allow garbage collection
    supabaseClient = null;
  }
};

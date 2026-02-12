-- Fix user_sessions table to allow NULL user_id for anonymous sessions
-- This allows the chatbot to work without authentication

-- First, check the current constraint
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'user_sessions'::regclass;

-- Drop the foreign key constraint if it exists
ALTER TABLE user_sessions 
DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;

-- Make user_id nullable
ALTER TABLE user_sessions 
ALTER COLUMN user_id DROP NOT NULL;

-- Re-add the foreign key constraint with ON DELETE CASCADE
-- This allows NULL values and cascades deletes
ALTER TABLE user_sessions
ADD CONSTRAINT user_sessions_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- Verify the change
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_sessions' 
AND column_name = 'user_id';

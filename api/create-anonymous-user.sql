-- Create anonymous user profile for unauthenticated dashboard chatbot sessions
-- This allows sessions to be created without requiring user authentication

-- Insert anonymous user profile if it doesn't exist
INSERT INTO user_profiles (
  user_id,
  full_name,
  country,
  organization_name,
  has_completed_onboarding,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Anonymous User',
  'Unknown',
  'Unknown',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO NOTHING;

-- Verify the anonymous user was created
SELECT * FROM user_profiles WHERE user_id = '00000000-0000-0000-0000-000000000000';

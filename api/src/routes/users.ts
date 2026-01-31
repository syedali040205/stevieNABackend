import { Router, Response } from 'express';
import { z } from 'zod';
import { validateJWT, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { profileRateLimiter } from '../middleware/rateLimiter';
import { userProfileManager } from '../services/userProfileManager';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const createProfileSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  country: z.string().min(1, 'Country is required'),
  organization_name: z.string().min(1, 'Organization name is required'),
  job_title: z.string().optional(),
  phone_number: z.string().optional(),
  company_website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  avatar_url: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
});

const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  organization_name: z.string().min(1).optional(),
  job_title: z.string().optional(),
  phone_number: z.string().optional(),
  company_website: z.string().url().optional().or(z.literal('')),
  avatar_url: z.string().url().optional().or(z.literal('')),
});

/**
 * GET /api/users/profile
 * Get user profile
 * Requirements: 7.1
 */
router.get('/profile', validateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const profile = await userProfileManager.getProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'User profile not found. Please complete onboarding.',
        timestamp: new Date().toISOString(),
      });
    }

    const hasCompletedOnboarding = await userProfileManager.hasCompletedOnboarding(userId);

    return res.json({
      success: true,
      user: {
        ...profile,
        has_completed_onboarding: hasCompletedOnboarding,
      },
    });
  } catch (error) {
    logger.error('Error getting user profile', { error, userId: req.user?.id });
    return res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: 'Failed to retrieve user profile',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/users/profile
 * Create or update user profile
 * Requirements: 7.2
 */
router.post(
  '/profile',
  profileRateLimiter,
  validateJWT,
  validate(createProfileSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const email = req.user!.email || '';

      // Check if profile exists
      const existingProfile = await userProfileManager.getProfile(userId);

      let profile;
      let isNewUser = false;

      if (existingProfile) {
        // Update existing profile
        profile = await userProfileManager.updateProfile(userId, req.body);
      } else {
        // Create new profile
        profile = await userProfileManager.createProfile({
          id: userId,
          email,
          ...req.body,
        });
        isNewUser = true;
      }

      res.json({
        success: true,
        user: profile,
        is_new_user: isNewUser,
      });
    } catch (error) {
      logger.error('Error creating/updating user profile', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'InternalServerError',
        message: 'Failed to save user profile',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * PUT /api/users/profile
 * Update user profile (partial update)
 * Requirements: 7.2
 */
router.put(
  '/profile',
  validateJWT,
  validate(updateProfileSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // Check if profile exists
      const existingProfile = await userProfileManager.getProfile(userId);

      if (!existingProfile) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: 'User profile not found. Please create profile first.',
          timestamp: new Date().toISOString(),
        });
      }

      const profile = await userProfileManager.updateProfile(userId, req.body);

      return res.json({
        success: true,
        user: profile,
      });
    } catch (error) {
      logger.error('Error updating user profile', { error, userId: req.user?.id });
      return res.status(500).json({
        success: false,
        error: 'InternalServerError',
        message: 'Failed to update user profile',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;

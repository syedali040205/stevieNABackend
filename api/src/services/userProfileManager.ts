import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../config/supabase';
import logger from '../utils/logger';

/**
 * User profile from database
 */
export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  country: string;
  organization_name: string;
  job_title?: string;
  phone_number?: string;
  company_website?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Create profile request
 */
export interface CreateProfileRequest {
  id: string; // User ID from auth.users
  email: string;
  full_name: string;
  country: string;
  organization_name: string;
  job_title?: string;
  phone_number?: string;
  company_website?: string;
  avatar_url?: string;
}

/**
 * Update profile request
 */
export interface UpdateProfileRequest {
  full_name?: string;
  country?: string;
  organization_name?: string;
  job_title?: string;
  phone_number?: string;
  company_website?: string;
  avatar_url?: string;
}

/**
 * User Profile Manager
 * Handles CRUD operations for user profiles
 * Requirements: 0.1, 7.1, 7.2
 */
export class UserProfileManager {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  /**
   * Get user profile by ID
   * @param userId - User UUID from auth
   * @returns User profile or null if not found
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return null;
        }
        throw new Error(`Failed to get profile: ${error.message}`);
      }

      return data as UserProfile;
    } catch (error) {
      logger.error('Error getting user profile', { userId, error });
      throw error;
    }
  }

  /**
   * Create new user profile
   * @param data - Profile data
   * @returns Created profile
   */
  async createProfile(data: CreateProfileRequest): Promise<UserProfile> {
    try {
      const { data: profile, error } = await this.client
        .from('users')
        .insert({
          id: data.id,
          email: data.email,
          full_name: data.full_name,
          country: data.country,
          organization_name: data.organization_name,
          job_title: data.job_title,
          phone_number: data.phone_number,
          company_website: data.company_website,
          avatar_url: data.avatar_url,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create profile: ${error.message}`);
      }

      if (!profile) {
        throw new Error('Failed to create profile: No data returned');
      }

      logger.info('User profile created', { userId: data.id });
      return profile as UserProfile;
    } catch (error) {
      logger.error('Error creating user profile', { data, error });
      throw error;
    }
  }

  /**
   * Update user profile
   * @param userId - User UUID
   * @param data - Fields to update
   * @returns Updated profile
   */
  async updateProfile(userId: string, data: UpdateProfileRequest): Promise<UserProfile> {
    try {
      const { data: profile, error } = await this.client
        .from('users')
        .update(data)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update profile: ${error.message}`);
      }

      if (!profile) {
        throw new Error('Failed to update profile: No data returned');
      }

      logger.info('User profile updated', { userId });
      return profile as UserProfile;
    } catch (error) {
      logger.error('Error updating user profile', { userId, error });
      throw error;
    }
  }

  /**
   * Check if user has completed onboarding
   * @param userId - User UUID
   * @returns True if profile exists with required fields
   */
  async hasCompletedOnboarding(userId: string): Promise<boolean> {
    try {
      const profile = await this.getProfile(userId);
      
      if (!profile) {
        return false;
      }

      // Check required fields
      return !!(
        profile.full_name &&
        profile.country &&
        profile.organization_name
      );
    } catch (error) {
      logger.error('Error checking onboarding status', { userId, error });
      return false;
    }
  }
}

// Export singleton instance
export const userProfileManager = new UserProfileManager();

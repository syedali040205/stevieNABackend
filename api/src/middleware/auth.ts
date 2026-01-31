import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../config/supabase';

// Extend Express Request type to include user information
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

/**
 * JWT token validation middleware
 * Validates Supabase JWT tokens and attaches user information to request
 * 
 * Requirements: 7.1, 8.1
 */
export const validateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or missing authentication token',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate JWT token using Supabase
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired authentication token',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Attach user information to request
    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role,
    };

    next();
  } catch (error) {
    console.error('JWT validation error:', error);
    res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: 'Failed to validate authentication token',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Optional authentication middleware
 * Validates JWT if present but doesn't require it
 * Useful for endpoints that work with or without authentication
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      next();
      return;
    }

    const token = authHeader.substring(7);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (!error && data.user) {
      // Valid token, attach user information
      req.user = {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role,
      };
    }

    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    // Continue without authentication on error
    next();
  }
};

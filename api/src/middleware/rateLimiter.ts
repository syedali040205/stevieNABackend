import rateLimit from 'express-rate-limit';
import logger from '../utils/logger';

/**
 * Global rate limiter for all API endpoints.
 * Limits: 1000 requests per 15 minutes per IP.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    error: 'TooManyRequests',
    message: 'Too many requests from this IP, please try again later.',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('rate_limit_exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    res.status(429).json({
      success: false,
      error: 'TooManyRequests',
      message: 'Too many requests from this IP, please try again later.',
      timestamp: new Date().toISOString(),
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * Conversation-specific rate limiter.
 * Limits: 100 conversation starts per hour per user.
 */
export const conversationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Limit each user to 100 conversation starts per hour
  message: {
    success: false,
    error: 'TooManyRequests',
    message: 'Too many conversation requests. Please try again later.',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Only use custom key if userId exists, otherwise use default IP-based limiting
  skip: (_req) => false, // Don't skip any requests
  handler: (req, res) => {
    logger.warn('conversation_rate_limit_exceeded', {
      userId: (req as any).userId,
      ip: req.ip,
      path: req.path,
    });

    res.status(429).json({
      success: false,
      error: 'TooManyRequests',
      message: 'Too many conversation requests. Please try again in an hour.',
      timestamp: new Date().toISOString(),
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * Profile update rate limiter.
 * Limits: 20 profile updates per hour per user.
 */
export const profileRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each user to 20 profile updates per hour
  message: {
    success: false,
    error: 'TooManyRequests',
    message: 'Too many profile update requests. Please try again later.',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use default IP-based limiting
  skip: (_req) => false, // Don't skip any requests
  handler: (req, res) => {
    logger.warn('profile_rate_limit_exceeded', {
      userId: (req as any).userId,
      ip: req.ip,
    });

    res.status(429).json({
      success: false,
      error: 'TooManyRequests',
      message: 'Too many profile update requests. Please try again later.',
      timestamp: new Date().toISOString(),
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

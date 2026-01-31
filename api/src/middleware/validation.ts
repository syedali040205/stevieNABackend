import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import logger from '../utils/logger';

/**
 * Validation middleware factory
 * Creates middleware that validates request body, query, or params against a Zod schema
 */
export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[source];
      const validated = await schema.parseAsync(data);
      req[source] = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.warn('Validation error', {
          correlationId: req.correlationId,
          errors,
          source,
        });

        res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: 'Request validation failed',
          fields: errors,
          timestamp: new Date().toISOString(),
        });
      } else {
        next(error);
      }
    }
  };
};

/**
 * Input sanitization middleware
 * Prevents XSS attacks by sanitizing string inputs
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous characters
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

// Common validation schemas
export const schemas = {
  uuid: z.string().uuid('Invalid UUID format'),
  email: z.string().email('Invalid email format'),
  nonEmptyString: z.string().min(1, 'Field cannot be empty'),
  positiveInt: z.number().int().positive('Must be a positive integer'),
};


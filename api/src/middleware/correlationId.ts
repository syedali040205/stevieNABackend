import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Extend Express Request type to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

/**
 * Middleware to add correlation ID to each request for tracking across services
 * 
 * The correlation ID can be:
 * 1. Provided by the client via X-Correlation-ID header
 * 2. Auto-generated if not provided
 * 
 * The correlation ID is:
 * - Added to the request object for use in logging
 * - Added to the response headers for client tracking
 */
export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Get correlation ID from header or generate new one
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
  
  // Add to request object
  req.correlationId = correlationId;
  
  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);
  
  next();
};

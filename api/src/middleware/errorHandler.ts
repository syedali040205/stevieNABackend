import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { errorCounter } from '../utils/metrics';

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public errorCode: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error types for consistent error handling
 */
export const ErrorTypes = {
  VALIDATION_ERROR: 'ValidationError',
  AUTHENTICATION_ERROR: 'AuthenticationError',
  AUTHORIZATION_ERROR: 'AuthorizationError',
  NOT_FOUND: 'NotFound',
  CONFLICT: 'Conflict',
  DATABASE_ERROR: 'DatabaseError',
  EXTERNAL_SERVICE_ERROR: 'ExternalServiceError',
  INTERNAL_SERVER_ERROR: 'InternalServerError',
  BAD_REQUEST: 'BadRequest',
  RATE_LIMIT_ERROR: 'RateLimitError',
} as const;
/**
 * Helper functions to create common errors
 */
export const createError = {
  validation: (message: string, details?: any) =>
    new AppError(400, message, ErrorTypes.VALIDATION_ERROR, details),
  
  authentication: (message: string = 'Authentication required') =>
    new AppError(401, message, ErrorTypes.AUTHENTICATION_ERROR),
  
  authorization: (message: string = 'Insufficient permissions') =>
    new AppError(403, message, ErrorTypes.AUTHORIZATION_ERROR),
  
  notFound: (resource: string = 'Resource') =>
    new AppError(404, `${resource} not found`, ErrorTypes.NOT_FOUND),
  
  conflict: (message: string) =>
    new AppError(409, message, ErrorTypes.CONFLICT),
  
  database: (message: string = 'Database operation failed') =>
    new AppError(500, message, ErrorTypes.DATABASE_ERROR),
  
  externalService: (service: string, message?: string) =>
    new AppError(
      503,
      message || `External service ${service} unavailable`,
      ErrorTypes.EXTERNAL_SERVICE_ERROR
    ),
  
  internal: (message: string = 'An unexpected error occurred') =>
    new AppError(500, message, ErrorTypes.INTERNAL_SERVER_ERROR),
  
  badRequest: (message: string) =>
    new AppError(400, message, ErrorTypes.BAD_REQUEST),
  
  rateLimit: (message: string = 'Too many requests') =>
    new AppError(429, message, ErrorTypes.RATE_LIMIT_ERROR),
};

/**
 * Determine error severity for logging and metrics
 */
const getErrorSeverity = (statusCode: number): 'critical' | 'error' | 'warning' => {
  if (statusCode >= 500) return 'critical';
  if (statusCode >= 400) return 'warning';
  return 'error';
};

/**
 * Global error handler middleware
 * 
 * Handles:
 * - AppError instances (known application errors)
 * - Validation errors from Zod or other validators
 * - Unexpected errors
 * 
 * Features:
 * - Structured error logging with correlation ID
 * - Prometheus error metrics
 * - User-friendly error messages (no internal details in production)
 * - Stack traces in development only
 */
export const errorHandlerMiddleware = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Default error values
  let statusCode = 500;
  let errorCode: string = ErrorTypes.INTERNAL_SERVER_ERROR;
  let message = 'An unexpected error occurred';
  let details: any = undefined;
  
  // Handle AppError instances
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    message = err.message;
    details = err.details;
  }
  // Handle Zod validation errors
  else if (err.name === 'ZodError') {
    statusCode = 400;
    errorCode = ErrorTypes.VALIDATION_ERROR;
    message = 'Validation failed';
    details = (err as any).errors;
  }
  // Handle other known error types
  else if (err.message) {
    message = err.message;
  }
  
  // Determine severity
  const severity = getErrorSeverity(statusCode);
  
  // Log error with full context
  logger.error('Request error', {
    correlationId: req.correlationId,
    errorCode,
    message,
    statusCode,
    method: req.method,
    url: req.url,
    stack: err.stack,
    details,
    userId: (req as any).user?.id, // If auth middleware adds user
  });
 
  // Track error metrics
  errorCounter.inc({
    error_type: errorCode,
    severity,
  });
  
  // Prepare response
  const errorResponse: any = {
    success: false,
    error: errorCode,
    message,
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
  };
  // Add details in development or for validation errors
  if (details && (process.env.NODE_ENV === 'development' || statusCode === 400)) {
    errorResponse.details = details;
  }
  
  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    errorResponse.stack = err.stack;
  }
  
  // Send response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async error wrapper to catch errors in async route handlers
 * 
 * Usage:
 * app.get('/route', asyncHandler(async (req, res) => {
 *   // async code that might throw
 * }));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

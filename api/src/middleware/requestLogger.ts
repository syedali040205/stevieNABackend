import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { httpRequestCounter, httpRequestDuration, activeConnections } from '../utils/metrics';

/**
 * Middleware to log HTTP requests and track metrics
 * 
 * Logs:
 * - Request start with method, URL, correlation ID
 * - Request completion with status code, duration
 * 
 * Tracks Prometheus metrics:
 * - http_requests_total counter
 * - http_request_duration_seconds histogram
 * - active_connections gauge
 */
export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  
  // Increment active connections
  activeConnections.inc();
  
  // Log request start
  logger.http('Incoming request', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  
  // Capture response finish event
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    const route = req.route?.path || req.path;
    
    // Decrement active connections
    activeConnections.dec();
    
    // Record metrics
    httpRequestCounter.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });
    
    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode,
      },
      duration
    );
    
    // Log request completion
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
    logger.log(logLevel, 'Request completed', {
      correlationId: req.correlationId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration.toFixed(3)}s`,
    });
  });
  
  next();
};

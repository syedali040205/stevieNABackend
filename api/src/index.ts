// Load environment variables FIRST, before any other imports
import dotenv from "dotenv";
import path from "path";

// Try multiple paths for .env file (for local development)
const possibleEnvPaths = [
  path.resolve(process.cwd(), ".env"), // Current directory
  path.resolve(__dirname, "..", ".env"), // api/.env
  path.resolve(__dirname, "..", "..", ".env"), // root .env
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  console.log("Trying to load environment from:", envPath);
  const result = dotenv.config({ path: envPath });

  if (!result.error) {
    console.log(".env file loaded successfully from:", envPath);
    envLoaded = true;
    break;
  }
}

// In production (Render), environment variables are set via dashboard, not .env file
if (!envLoaded && process.env.NODE_ENV !== "production") {
  console.error("Warning: Could not find .env file in any expected location");
  console.error("Tried paths:", possibleEnvPaths);
  console.error(
    "Make sure environment variables are set via your hosting platform",
  );
}

console.log("Environment check:", {
  NODE_ENV: process.env.NODE_ENV || "development",
  SUPABASE_URL: process.env.SUPABASE_URL ? "Set" : "Missing",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "Set" : "Missing",
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY ? "Set" : "Missing",
  AI_SERVICE_URL: process.env.AI_SERVICE_URL ? "Set" : "Missing",
});

// Now import everything else
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { getSupabaseClient, closeSupabaseConnection } from "./config/supabase";
import { cacheManager } from "./services/cacheManager";
import logger from "./utils/logger";
import { correlationIdMiddleware } from "./middleware/correlationId";
import { requestLoggerMiddleware } from "./middleware/requestLogger";
import { errorHandlerMiddleware } from "./middleware/errorHandler";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { sanitizeInput } from "./middleware/validation";
import healthRouter from "./routes/health";
import metricsRouter from "./routes/metrics";
import usersRouter from "./routes/users";
import unifiedChatbotRouter from "./routes/unified-chatbot";
import documentsRouter from "./routes/documents";
import diagnosticRouter from "./routes/diagnostic";
import internalRouter from "./routes/internal";
import ragDiagnosticRouter from "./routes/rag-diagnostic";

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - Required for Render and other reverse proxies
// This allows express-rate-limit to correctly identify users by IP
app.set("trust proxy", 1);

// CORS configuration
// I5 Fix: Use CORS_ORIGINS env var in production (comma-separated list of allowed origins).
// Falls back to '*' only in development when CORS_ORIGINS is not set.
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : "*";

if (allowedOrigins === "*") {
  logger.warn("cors_wildcard_origin", {
    message: "CORS origin set to *. Set CORS_ORIGINS env var for production.",
  });
}

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Correlation-ID"],
  exposedHeaders: [
    "X-Correlation-ID",
    "RateLimit-Limit",
    "RateLimit-Remaining",
    "RateLimit-Reset",
  ],
  maxAge: 86400, // 24 hours
};

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  }),
);
app.use(cors(corsOptions));

// Compression middleware
app.use(
  compression({
    filter: (req: any, res: any) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
    threshold: 1024, // Only compress responses > 1KB
    level: 6, // Compression level (0-9)
  }),
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Sanitize all inputs to prevent XSS
app.use(sanitizeInput);

// Correlation ID middleware (must be early in the chain)
app.use(correlationIdMiddleware);

// Request logging and metrics middleware
app.use(requestLoggerMiddleware);

// Global rate limiter
app.use("/api", globalRateLimiter);

// Initialize Supabase client on startup
try {
  getSupabaseClient();
  logger.info("Supabase client initialized successfully");
} catch (error) {
  logger.error("Failed to initialize Supabase client", { error });
  process.exit(1);
}

// Routes
app.use("/api/health", healthRouter);
app.use("/api/internal", internalRouter);
app.use("/metrics", metricsRouter);
app.use("/api/users", usersRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/diagnostic", diagnosticRouter);
app.use("/api/rag-diagnostic", ragDiagnosticRouter);
app.use("/api", unifiedChatbotRouter);

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    service: "Stevie Awards Recommendation API",
    version: "1.0.0",
    status: "running",
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "NotFound",
    message: "Endpoint not found",
    timestamp: new Date().toISOString(),
  });
});

// Global error handler (must be last)
app.use(errorHandlerMiddleware);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Stevie Awards API running on port ${PORT}`);
  logger.info(`Health check available at http://localhost:${PORT}/api/health`);
  logger.info(`Metrics available at http://localhost:${PORT}/metrics`);
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info("HTTP server closed");

    try {
      await cacheManager.close();
      logger.info("Redis connection closed");
    } catch (e) {
      logger.warn("Redis close error", { error: (e as Error).message });
    }

    closeSupabaseConnection();
    logger.info("Database connections closed");

    logger.info("Graceful shutdown complete");
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

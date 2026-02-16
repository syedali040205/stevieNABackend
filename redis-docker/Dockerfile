# Production Redis Dockerfile
FROM redis:7-alpine

# Copy production Redis configuration
COPY redis-production.conf /usr/local/etc/redis/redis.conf

# Create data directory with proper permissions
RUN mkdir -p /data && chown redis:redis /data

# Expose Redis port
EXPOSE 6379

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD redis-cli ping || exit 1

# Run Redis with config
# Password should be set via REDIS_PASSWORD env var
CMD redis-server /usr/local/etc/redis/redis.conf --requirepass ${REDIS_PASSWORD:-changeme123}

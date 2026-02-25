# Production Stack Requirements

Simple checklist of what you need to run this application in production.

---

## 1. Compute (Application Server)

**What you need**: Container hosting service

**Requirements**:
- Node.js 18+ runtime
- Docker container support
- Auto-scaling (2-10 instances)
- Health check support
- Rolling deployments

**Examples**: AWS ECS Fargate, Google Cloud Run, Azure Container Apps, Render

---

## 2. Database

**What you need**: PostgreSQL with pgvector extension

**Requirements**:
- PostgreSQL 14+
- pgvector extension installed
- 100 GB storage minimum
- Automated daily backups
- Multi-AZ for high availability

**Examples**: AWS RDS, Supabase, Google Cloud SQL, Azure Database

**Current setup**: Supabase (already configured)

---

## 3. Cache

**What you need**: Redis instance

**Requirements**:
- Redis 6.0+
- 4-8 GB memory
- Persistence enabled (AOF + RDB)
- Automatic failover

**Examples**: AWS ElastiCache, Redis Cloud, Azure Cache for Redis

**Current setup**: Redis Docker container (needs production upgrade)

---

## 4. Load Balancer

**What you need**: Application load balancer

**Requirements**:
- HTTPS/SSL termination
- Health checks on `/api/health/ready`
- Sticky sessions (optional)
- Auto-scaling integration

**Examples**: AWS ALB, Google Cloud Load Balancer, Azure Load Balancer

---

## 5. Environment Variables

**Required**:
```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key

# OpenAI
OPENAI_API_KEY=sk-proj-your-key

# Redis
REDIS_URL=redis://your-redis-host:6379
REDIS_PASSWORD=your-password

# Security
INTERNAL_API_KEY=your-secure-key

# CORS
CORS_ORIGINS=https://your-frontend.com
```

---

## 6. Monitoring

**What you need**: Basic monitoring setup

**Requirements**:
- Health check monitoring (UptimeRobot, Pingdom)
- Error tracking (Sentry, optional)
- Log aggregation (CloudWatch, Datadog, optional)

**Current setup**: UptimeRobot monitoring `/api/health`

---

## 7. Estimated Costs

### Minimal Production Setup
- **Compute**: $50-100/month (2-4 containers)
- **Database**: $200-300/month (Supabase Pro or RDS)
- **Redis**: $50-100/month (managed Redis)
- **Load Balancer**: $20-30/month
- **Total**: ~$350-550/month

### High-Traffic Setup
- **Compute**: $200-400/month (5-10 containers)
- **Database**: $400-600/month (larger instance)
- **Redis**: $100-200/month (cluster mode)
- **Load Balancer**: $30-50/month
- **Total**: ~$750-1250/month

---

## 8. Deployment Checklist

### Before Going Live
- [ ] Set all environment variables
- [ ] Run database migrations
- [ ] Configure health checks
- [ ] Set up SSL certificate
- [ ] Configure CORS origins
- [ ] Set up monitoring/alerts
- [ ] Test auto-scaling
- [ ] Configure backups

### After Deployment
- [ ] Verify health endpoints return 200
- [ ] Test API endpoints
- [ ] Monitor error rates
- [ ] Check database connections
- [ ] Verify Redis cache working

---

## 9. Quick Setup Options

### Option A: AWS (Most Common)
- **Compute**: ECS Fargate
- **Database**: RDS PostgreSQL with pgvector
- **Cache**: ElastiCache Redis
- **Load Balancer**: Application Load Balancer
- **Estimated**: $400-800/month

### Option B: Render + Supabase (Easiest)
- **Compute**: Render (already deployed)
- **Database**: Supabase (already configured)
- **Cache**: Redis Cloud or Upstash
- **Load Balancer**: Included with Render
- **Estimated**: $300-500/month

### Option C: Google Cloud
- **Compute**: Cloud Run
- **Database**: Cloud SQL PostgreSQL
- **Cache**: Memorystore Redis
- **Load Balancer**: Cloud Load Balancing
- **Estimated**: $400-700/month

---

## 10. Current Status

✅ **Already Configured**:
- Node.js application (TypeScript)
- Supabase database with pgvector
- Docker containerization
- Health check endpoints
- Render deployment

⚠️ **Needs Production Upgrade**:
- Redis (currently Docker, needs managed service)
- Load balancer (if scaling beyond 1 instance)
- Monitoring/alerting setup
- Backup verification

---

## Next Steps

1. **Choose your stack** (AWS, GCP, or stay with Render)
2. **Upgrade Redis** to managed service
3. **Configure monitoring** (UptimeRobot already set up)
4. **Set up backups** (verify Supabase backups)
5. **Load test** your application
6. **Document runbooks** for common issues

---

That's it! Keep it simple, monitor what matters, and scale when needed.

# Deploy Redis to Render

## Option 1: Deploy Redis as Docker Service on Render

### Step 1: Push Redis Docker Setup to GitHub
Make sure your `redis-docker` folder is in your GitHub repo with:
- `Dockerfile`
- `redis-production.conf`

### Step 2: Create Redis Service on Render

1. Go to Render Dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `stevie-redis`
   - **Region**: Oregon (same as API)
   - **Branch**: main
   - **Root Directory**: `redis-docker`
   - **Environment**: Docker
   - **Dockerfile Path**: `Dockerfile` (default)
   - **Plan**: Starter ($7/month) or higher

### Step 3: Set Environment Variables

In the Redis service settings, add:
- **Key**: `REDIS_PASSWORD`
- **Value**: Generate a strong password (e.g., use https://passwordsgenerator.net/)

Example: `xK9mP2nQ7wR5tY8uI3oL6aS4dF1gH0jZ`

### Step 4: Configure Health Check

Render should auto-detect the HEALTHCHECK from Dockerfile, but verify:
- **Health Check Path**: Not applicable (TCP service)
- **Port**: 6379

### Step 5: Deploy

Click "Create Web Service" - Render will:
1. Build Docker image
2. Deploy Redis container
3. Provide internal URL

### Step 6: Get Redis Connection Details

After deployment, note:
- **Internal URL**: `stevie-redis:6379` (Render internal network)
- **Password**: The one you set in env vars

### Step 7: Update API Service

In your API service on Render, add/update environment variables:
- **REDIS_URL**: `redis://stevie-redis:6379`
- **REDIS_PASSWORD**: Same password as Redis service
- **REDIS_DB**: `0`

### Step 8: Redeploy API

Render will auto-redeploy API with new Redis connection.

### Step 9: Verify

Check API logs for:
```
redis_connected { "url": "redis://stevie-redis:6379" }
```

Test health endpoint:
```bash
curl https://your-api.onrender.com/api/redis-health
```

---

## Option 2: Use Managed Redis (Easier)

If Docker deployment is too complex, use a managed Redis service:

### Upstash (Recommended - Free Tier)
1. Go to https://upstash.com/
2. Sign up (free, no credit card)
3. Create Redis database
4. Copy Redis URL (starts with `rediss://`)
5. Add to Render API env vars:
   - `REDIS_URL`: Upstash Redis URL
   - `REDIS_PASSWORD`: (included in URL)

### Redis Labs (Redis Cloud)
1. Go to https://redis.com/try-free/
2. Sign up (free 30MB)
3. Create database
4. Copy connection details
5. Add to Render API env vars

---

## Cost Comparison

| Option | Cost | Pros | Cons |
|--------|------|------|------|
| Self-hosted Docker on Render | $7/month | Full control, no limits | Need to manage |
| Upstash Free Tier | Free | Easy, serverless | 10k commands/day limit |
| Redis Labs Free | Free | Managed, reliable | 30MB storage limit |
| Upstash Paid | $0.20/10k commands | Pay-as-you-go | Can get expensive |

---

## Recommendation

**For Development/Testing**: Upstash Free Tier
**For Production**: Self-hosted Docker on Render ($7/month)

The self-hosted option gives you:
- 256MB memory (vs 30MB free tier)
- Unlimited commands
- Full control over configuration
- Better performance (same network as API)

---

## Troubleshooting

### Redis service won't start
- Check Dockerfile syntax
- Verify redis-production.conf is valid
- Check logs in Render dashboard

### API can't connect to Redis
- Verify internal URL: `redis://stevie-redis:6379`
- Check password matches in both services
- Ensure both services are in same region

### Redis running out of memory
- Increase maxmemory in redis-production.conf
- Upgrade Render plan
- Check for memory leaks (use `INFO memory` command)

---

## Monitoring

### Check Redis Memory Usage
```bash
# Connect to Redis container
redis-cli -h stevie-redis -p 6379 -a YOUR_PASSWORD INFO memory
```

### Check Redis Stats
```bash
redis-cli -h stevie-redis -p 6379 -a YOUR_PASSWORD INFO stats
```

### Monitor via API
```bash
curl https://your-api.onrender.com/api/redis-health
```

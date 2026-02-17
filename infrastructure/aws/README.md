# AWS Production Deployment Guide

## Architecture Overview

```
Internet
    ↓
CloudFront (CDN)
    ↓
Application Load Balancer
    ↓
ECS Fargate (Auto-scaling 2-50 tasks)
    ↓
├── ElastiCache Redis Cluster (Multi-AZ)
├── RDS Aurora PostgreSQL (Multi-AZ)
├── S3 (Document Storage)
└── Pinecone (Vector DB)
```

## Option 1: AWS App Runner (Recommended - Easiest)

### Pros:
- ✅ Simplest deployment (like Heroku)
- ✅ Auto-scaling built-in
- ✅ No VPC management
- ✅ Deploy from GitHub in 5 minutes
- ✅ Perfect for chat/streaming

### Cost:
- $25-100/month (scales with traffic)

### Setup Steps:

1. **Create App Runner Service**
   ```bash
   # Via AWS Console
   - Go to App Runner
   - Connect GitHub repo
   - Root directory: api
   - Build command: npm install && npm run build
   - Start command: npm start
   - Port: 3000
   ```

2. **Add Environment Variables**
   ```
   NODE_ENV=production
   SUPABASE_URL=your-url
   SUPABASE_SERVICE_ROLE_KEY=your-key
   OPENAI_API_KEY=your-key
   REDIS_URL=your-elasticache-url
   REDIS_PASSWORD=your-password
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your-key
   AWS_SECRET_ACCESS_KEY=your-secret
   S3_BUCKET_NAME=stevienominationfaqs
   PINECONE_API_KEY=your-key
   PINECONE_INDEX_NAME=stevie-kb-documents
   ```

3. **Configure Auto-scaling**
   - Min instances: 2
   - Max instances: 50
   - CPU: 1 vCPU
   - Memory: 2 GB

4. **Done!** App Runner handles everything else.

---

## Option 2: ECS Fargate (More Control)

### Pros:
- ✅ Full control over networking
- ✅ VPC integration
- ✅ Better for complex setups
- ✅ Cheaper at scale

### Cost:
- $120-300/month

### Setup:

Use the Terraform configuration in `terraform/` folder:

```bash
cd infrastructure/aws/terraform
terraform init
terraform plan
terraform apply
```

---

## Required AWS Services:

### 1. ElastiCache Redis
```
Type: Redis 7.x
Node: cache.r6g.large
Nodes: 3 (Multi-AZ)
Cost: ~$300/month
```

**Setup:**
1. Go to ElastiCache console
2. Create Redis cluster
3. Choose: cache.r6g.large
4. Enable Multi-AZ
5. Set password
6. Note endpoint URL

### 2. RDS Aurora PostgreSQL (Optional - if migrating from Supabase)
```
Type: Aurora Serverless v2
Engine: PostgreSQL 15
Min ACU: 2
Max ACU: 16
Cost: ~$150-400/month
```

**Setup:**
1. Go to RDS console
2. Create Aurora Serverless v2
3. Choose PostgreSQL
4. Enable Multi-AZ
5. Set master password
6. Note endpoint URL

### 3. S3 (Already set up)
```
Bucket: stevienominationfaqs
Region: us-east-1
Cost: ~$10/month
```

### 4. CloudFront (Optional - for CDN)
```
Origin: App Runner or ALB
Cost: ~$85/month
```

---

## Deployment Steps:

### Quick Start (App Runner):

1. **Push code to GitHub** ✓ (Already done)

2. **Create ElastiCache Redis**
   ```bash
   aws elasticache create-replication-group \
     --replication-group-id stevie-redis \
     --replication-group-description "Stevie Awards Redis" \
     --engine redis \
     --cache-node-type cache.r6g.large \
     --num-cache-clusters 3 \
     --automatic-failover-enabled \
     --auth-token YOUR_STRONG_PASSWORD
   ```

3. **Create App Runner Service**
   - Go to AWS Console → App Runner
   - Click "Create service"
   - Source: GitHub
   - Repository: your-repo
   - Branch: main
   - Build settings:
     - Build command: `cd api && npm install && npm run build`
     - Start command: `cd api && npm start`
     - Port: 3000
   - Add environment variables (see above)
   - Auto-scaling: Min 2, Max 50
   - Create service

4. **Test**
   ```bash
   curl https://your-app.us-east-1.awsapprunner.com/api/health
   curl https://your-app.us-east-1.awsapprunner.com/api/redis-health
   ```

5. **Done!**

---

## Cost Breakdown (1M users):

```
App Runner (2-10 instances):     $50-200/month
ElastiCache Redis:               $300/month
RDS Aurora (if used):            $150-400/month
S3:                              $10/month
CloudFront (optional):           $85/month
OpenAI API (with cache):         $600-900/month
Pinecone:                        $70/month
-------------------------------------------
Total:                           $1,265-2,065/month
```

---

## Monitoring:

### CloudWatch Dashboards:
- API response times
- Error rates
- Redis hit rates
- Auto-scaling metrics

### Alarms:
- High error rate (> 5%)
- High latency (> 2s)
- Redis memory (> 80%)
- CPU usage (> 70%)

---

## Scaling Strategy:

### 0-10k users:
- App Runner: 2 instances
- Redis: cache.t4g.medium (1 node)
- Cost: ~$100/month

### 10k-100k users:
- App Runner: 2-10 instances
- Redis: cache.r6g.large (3 nodes)
- Cost: ~$400/month

### 100k-1M users:
- App Runner: 10-50 instances
- Redis: cache.r6g.xlarge (3 nodes)
- Cost: ~$1,500/month

---

## Next Steps:

1. Create ElastiCache Redis cluster
2. Deploy to App Runner
3. Configure CloudWatch monitoring
4. Set up CloudFront (optional)
5. Test at scale

**Estimated setup time: 1-2 hours**

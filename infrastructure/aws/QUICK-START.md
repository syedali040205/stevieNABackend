# AWS Deployment - Quick Start

## Fastest Way: AWS App Runner (5 minutes)

### Step 1: Create ElastiCache Redis
```bash
aws elasticache create-replication-group \
  --replication-group-id stevie-redis \
  --replication-group-description "Stevie Awards Redis" \
  --engine redis \
  --engine-version 7.0 \
  --cache-node-type cache.r6g.large \
  --num-cache-clusters 3 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --auth-token YOUR_STRONG_PASSWORD_HERE \
  --region us-east-1
```

Wait 10-15 minutes for Redis to be ready.

### Step 2: Get Redis Endpoint
```bash
aws elasticache describe-replication-groups \
  --replication-group-id stevie-redis \
  --region us-east-1 \
  --query 'ReplicationGroups[0].ConfigurationEndpoint.Address' \
  --output text
```

### Step 3: Deploy to App Runner

1. Go to AWS Console → App Runner
2. Click "Create service"
3. **Source:**
   - Repository type: Source code repository
   - Connect to GitHub
   - Select your repository
   - Branch: main
   - Source directory: `api`

4. **Build settings:**
   - Configuration: Configure all settings here
   - Runtime: Node.js 18
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Port: 3000

5. **Service settings:**
   - Service name: `stevie-awards-api`
   - CPU: 1 vCPU
   - Memory: 2 GB
   - Environment variables:
     ```
     NODE_ENV=production
     PORT=3000
     SUPABASE_URL=your-supabase-url
     SUPABASE_SERVICE_ROLE_KEY=your-key
     OPENAI_API_KEY=your-key
     REDIS_URL=redis://YOUR_REDIS_ENDPOINT:6379
     REDIS_PASSWORD=YOUR_REDIS_PASSWORD
     REDIS_DB=0
     AWS_REGION=us-east-1
     AWS_ACCESS_KEY_ID=your-key
     AWS_SECRET_ACCESS_KEY=your-secret
     S3_BUCKET_NAME=stevienominationfaqs
     PINECONE_API_KEY=your-key
     PINECONE_INDEX_NAME=stevie-kb-documents
     PINECONE_ENVIRONMENT=us-east-1
     EMBEDDING_MODEL=text-embedding-3-small
     CORS_ORIGINS=https://your-frontend.com
     ```

6. **Auto-scaling:**
   - Min instances: 2
   - Max instances: 50
   - Max concurrency: 100

7. Click "Create & deploy"

### Step 4: Test
```bash
# Get your App Runner URL from console
curl https://your-app.us-east-1.awsapprunner.com/api/health
curl https://your-app.us-east-1.awsapprunner.com/api/redis-health
```

### Done! 🎉

Your API is now running on AWS with:
- ✅ Auto-scaling (2-50 instances)
- ✅ Redis caching
- ✅ Zero downtime deployments
- ✅ HTTPS by default
- ✅ CloudWatch monitoring

---

## Alternative: ECS Fargate (More Control)

### Step 1: Deploy Infrastructure with Terraform
```bash
cd infrastructure/aws/terraform

# Initialize Terraform
terraform init

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
aws_region = "us-east-1"
project_name = "stevie-awards"
environment = "prod"
redis_password = "YOUR_STRONG_PASSWORD_HERE"
EOF

# Plan
terraform plan

# Apply
terraform apply
```

### Step 2: Build and Push Docker Image
```bash
# Get ECR repository URL from Terraform output
ECR_REPO=$(terraform output -raw ecr_repository_url)

# Build image
cd ../../../api
docker build -t stevie-awards-api .

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REPO

# Tag and push
docker tag stevie-awards-api:latest $ECR_REPO:latest
docker push $ECR_REPO:latest
```

### Step 3: Create ECS Task Definition
```bash
# Create task-definition.json (see example in repo)
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### Step 4: Create ECS Service
```bash
aws ecs create-service \
  --cluster stevie-awards-cluster \
  --service-name stevie-awards-api-service \
  --task-definition stevie-awards-api-task \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=api,containerPort=3000"
```

### Step 5: Test
```bash
# Get ALB DNS from Terraform output
ALB_DNS=$(terraform output -raw alb_dns_name)

curl http://$ALB_DNS/api/health
curl http://$ALB_DNS/api/redis-health
```

---

## Cost Estimates

### App Runner (Recommended):
- 2-10 instances: $50-200/month
- ElastiCache Redis: $300/month
- **Total: $350-500/month**

### ECS Fargate:
- 2-10 tasks: $120-300/month
- ElastiCache Redis: $300/month
- ALB: $25/month
- **Total: $445-625/month**

---

## Monitoring

### CloudWatch Dashboards:
```bash
# View logs
aws logs tail /ecs/stevie-awards-api --follow

# View metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=stevie-awards-api-service \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Average
```

---

## Troubleshooting

### Redis connection issues:
```bash
# Test Redis connectivity
redis-cli -h YOUR_REDIS_ENDPOINT -p 6379 -a YOUR_PASSWORD ping
```

### ECS task not starting:
```bash
# Check task logs
aws ecs describe-tasks \
  --cluster stevie-awards-cluster \
  --tasks TASK_ID
```

### High latency:
- Check Redis hit rates in CloudWatch
- Scale up ECS tasks
- Upgrade Redis node type

---

## Next Steps

1. ✅ Deploy to AWS
2. ⬜ Set up CloudFront CDN
3. ⬜ Configure custom domain
4. ⬜ Set up CI/CD pipeline
5. ⬜ Configure monitoring alerts

#!/bin/bash

# AWS Deployment Script for Stevie Awards API
# This script deploys the API to AWS ECS Fargate

set -e

echo "🚀 Deploying Stevie Awards API to AWS..."

# Configuration
AWS_REGION="us-east-1"
PROJECT_NAME="stevie-awards"
ECR_REPO_NAME="${PROJECT_NAME}-api"
ECS_CLUSTER_NAME="${PROJECT_NAME}-cluster"
ECS_SERVICE_NAME="${PROJECT_NAME}-api-service"
TASK_FAMILY="${PROJECT_NAME}-api-task"

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"

echo "📦 Building Docker image..."
cd ../../api
docker build -t ${ECR_REPO_NAME}:latest .

echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REPO_URI}

echo "🏷️  Tagging image..."
docker tag ${ECR_REPO_NAME}:latest ${ECR_REPO_URI}:latest
docker tag ${ECR_REPO_NAME}:latest ${ECR_REPO_URI}:$(git rev-parse --short HEAD)

echo "⬆️  Pushing to ECR..."
docker push ${ECR_REPO_URI}:latest
docker push ${ECR_REPO_URI}:$(git rev-parse --short HEAD)

echo "🔄 Updating ECS service..."
aws ecs update-service \
  --cluster ${ECS_CLUSTER_NAME} \
  --service ${ECS_SERVICE_NAME} \
  --force-new-deployment \
  --region ${AWS_REGION}

echo "✅ Deployment initiated!"
echo "📊 Monitor deployment:"
echo "   aws ecs describe-services --cluster ${ECS_CLUSTER_NAME} --services ${ECS_SERVICE_NAME} --region ${AWS_REGION}"

import 'dotenv/config';
import { S3Client, PutObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3';

/**
 * Test S3 connection and upload
 * 
 * Usage: npx ts-node test-s3-connection.ts
 */

async function testS3() {
  console.log('🔍 Testing S3 connection...\n');

  // Check environment variables
  console.log('📋 Configuration:');
  console.log(`   Region: ${process.env.AWS_REGION}`);
  console.log(`   Bucket: ${process.env.S3_BUCKET_NAME}`);
  console.log(`   Access Key: ${process.env.AWS_ACCESS_KEY_ID?.substring(0, 8)}...`);
  console.log('');

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ AWS credentials not found in .env');
    process.exit(1);
  }

  // Create S3 client
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    // Test 1: List buckets
    console.log('1️⃣ Testing bucket access...');
    const listCommand = new ListBucketsCommand({});
    const buckets = await s3Client.send(listCommand);
    
    const bucketNames = buckets.Buckets?.map(b => b.Name) || [];
    const targetBucket = process.env.S3_BUCKET_NAME;
    
    if (bucketNames.includes(targetBucket)) {
      console.log(`   ✅ Bucket "${targetBucket}" found`);
    } else {
      console.log(`   ⚠️  Bucket "${targetBucket}" not found in your account`);
      console.log(`   Available buckets: ${bucketNames.join(', ')}`);
    }

    // Test 2: Upload a test file
    console.log('\n2️⃣ Testing file upload...');
    const testContent = 'This is a test file from Stevie Awards KB system';
    const testKey = 'test/connection-test.txt';
    
    const uploadCommand = new PutObjectCommand({
      Bucket: targetBucket,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
    });

    await s3Client.send(uploadCommand);
    console.log(`   ✅ Test file uploaded: ${testKey}`);

    console.log('\n✅ S3 connection successful!');
    console.log('\nYou can now ingest documents with S3 storage.');
  } catch (error: any) {
    console.error('\n❌ S3 connection failed!');
    console.error(`   Error: ${error.message}`);
    
    if (error.name === 'InvalidAccessKeyId') {
      console.error('\n💡 Solution: Check your AWS_ACCESS_KEY_ID');
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.error('\n💡 Solution: Check your AWS_SECRET_ACCESS_KEY');
    } else if (error.name === 'NoSuchBucket') {
      console.error('\n💡 Solution: Create the S3 bucket or update S3_BUCKET_NAME');
    } else {
      console.error('\n💡 Check your AWS credentials and bucket configuration');
    }
    
    process.exit(1);
  }
}

testS3()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });

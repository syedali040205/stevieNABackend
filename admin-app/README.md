# Stevie Awards - Admin Dashboard

Standalone admin app for managing KB documents. Connects to your Stevie backend API.

## Features

- ✅ Upload documents (text/markdown)
- ✅ Automatic chunking and embedding
- ✅ Store in S3 + Pinecone
- ✅ List all documents
- ✅ Delete documents (removes from all systems)
- ✅ Real-time statistics

## Quick Start

### 1. Install Dependencies
\`\`\`bash
npm install
\`\`\`

### 2. Configure Environment
Create \`.env.local\`:
\`\`\`env
NEXT_PUBLIC_API_URL=https://your-stevie-backend.onrender.com
NEXT_PUBLIC_INTERNAL_API_KEY=stevie-internal-key-2024-secure
\`\`\`

### 3. Run Locally
\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

### Option 1: One-Click Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/syedali040205/stevieNABackend/tree/main/admin-app)

### Option 2: Manual Deploy
\`\`\`bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd admin-app
vercel
\`\`\`

### Set Environment Variables on Vercel
1. Go to your project settings
2. Add environment variables:
   - \`NEXT_PUBLIC_API_URL\`: Your backend API URL
   - \`NEXT_PUBLIC_INTERNAL_API_KEY\`: Your internal API key

## Usage

### 1. Configure
- Enter your backend API URL
- Enter your internal API key
- Click "Load Documents"

### 2. Upload Document
- Choose a file or paste content
- Enter title
- Click "Upload & Process"
- System will automatically:
  - Chunk the content
  - Generate embeddings
  - Store in Pinecone
  - Store file in S3
  - Save metadata in Supabase

### 3. Delete Document
- Click "Delete" on any document
- Confirm deletion
- System will remove from:
  - Supabase (soft delete)
  - Pinecone (all vectors)
  - S3 (file)

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Axios** - API calls

## API Endpoints Used

- \`GET /api/internal/documents/stats\` - Get statistics
- \`GET /api/internal/documents\` - List documents
- \`POST /api/internal/documents/ingest\` - Upload document
- \`DELETE /api/internal/documents/:id\` - Delete document

## Security

- API key stored in localStorage
- All requests authenticated
- HTTPS enforced in production
- CORS configured on backend

## Development

\`\`\`bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start
\`\`\`

## Troubleshooting

### CORS Errors
Make sure your backend has the admin app URL in \`CORS_ORIGINS\`:
\`\`\`env
CORS_ORIGINS=https://your-admin-app.vercel.app
\`\`\`

### API Key Invalid
Check that \`INTERNAL_API_KEY\` matches on both frontend and backend.

### Upload Fails
- Check file format (.txt or .md)
- Verify backend has S3 credentials
- Check Pinecone API key is valid

## License

MIT

# Stevie Awards - Backend & Admin

This repository contains two separate services:

## 📁 Project Structure

\`\`\`
stevieNABackend/
├── api/                    # Node.js Backend API
│   ├── src/               # API source code
│   ├── .env               # Backend environment variables
│   └── package.json
│
└── admin-app/             # Next.js Admin Frontend
    ├── app/               # Next.js app directory
    ├── .env.local         # Frontend environment variables
    └── package.json
\`\`\`

## 🚀 Services

### 1. Backend API (\`api/\`)

Node.js/Express API that handles:
- Q&A chatbot with knowledge base
- Award category recommendations
- Document management (upload, delete)
- Vector search (Pinecone)
- File storage (S3)
- Caching (Redis)

**Deploy to**: Render.com, Railway, Heroku
**See**: \`api/README.md\`

### 2. Admin Frontend (\`admin-app/\`)

Next.js web app for managing KB documents:
- Upload documents (auto-chunks & embeds)
- List all documents
- Delete documents (removes from all systems)
- View real-time statistics

**Deploy to**: Vercel, Netlify
**See**: \`admin-app/README.md\`

## 🎯 Quick Start

### Backend API
\`\`\`bash
cd api
npm install
npm run dev
# Runs on http://localhost:3000
\`\`\`

### Admin Frontend
\`\`\`bash
cd admin-app
npm install
npm run dev
# Runs on http://localhost:3001
\`\`\`

## 📦 Deployment

### Deploy Backend (Render.com)
1. Push to GitHub
2. Go to [dashboard.render.com](https://dashboard.render.com)
3. New → Web Service
4. Connect repo, set root directory to \`api\`
5. Set environment variables
6. Deploy

### Deploy Admin (Vercel)
1. Push to GitHub
2. Go to [vercel.com](https://vercel.com)
3. New Project
4. Connect repo, set root directory to \`admin-app\`
5. Set environment variables:
   - \`NEXT_PUBLIC_API_URL\`: Your backend URL
   - \`NEXT_PUBLIC_INTERNAL_API_KEY\`: Your API key
6. Deploy

## 🔗 Connect Services

After deploying both:

1. **Update Backend CORS**: Add admin app URL to \`CORS_ORIGINS\` in backend
2. **Configure Admin**: Set \`NEXT_PUBLIC_API_URL\` to backend URL
3. **Test**: Open admin app, enter API key, load documents

## 📚 Documentation

- **Backend API**: See \`api/README.md\`
- **Admin App**: See \`admin-app/README.md\`
- **Admin Deploy**: See \`admin-app/DEPLOY.md\`

## 🔒 Security

- Backend uses API key authentication
- Admin app stores key in localStorage
- All production traffic over HTTPS
- CORS configured for allowed origins

## 🛠️ Tech Stack

### Backend
- Node.js + Express
- TypeScript
- Supabase (PostgreSQL)
- Pinecone (Vector DB)
- AWS S3 (File Storage)
- Redis (Caching)
- OpenAI (Embeddings)

### Frontend
- Next.js 14
- React
- TypeScript
- Tailwind CSS
- Axios

## 📞 Support

- Backend issues: Check \`api/\` logs
- Frontend issues: Check browser console
- CORS issues: Update \`CORS_ORIGINS\` in backend

## License

MIT

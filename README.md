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
- Award search assistant (natural language queries about Stevie Awards)
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

## 🔌 API Endpoints

### Award Search Assistant

**POST /api/award-search**

Search for information about Stevie Awards using natural language queries. The system uses AI-powered query planning, web crawling, and intelligent synthesis to provide comprehensive, cited answers.

#### Request

\`\`\`json
{
  "query": "What are the eligibility requirements for the Stevie Awards for Sales & Customer Service?",
  "options": {
    "forceRefresh": false  // Optional: force refresh cached data
  }
}
\`\`\`

**Parameters:**
- `query` (string, required): Natural language question about Stevie Awards (1-1000 characters)
- `options` (object, optional):
  - `forceRefresh` (boolean, optional): Force refresh cached data instead of using cache

#### Response (Success)

\`\`\`json
{
  "success": true,
  "answer": "The Stevie Awards for Sales & Customer Service are open to organizations worldwide...[1]\n\nKey eligibility requirements:\n- Organizations of any size can enter[1]\n- Entries accepted from all countries[2]\n- Work must have been completed after January 1, 2023[1]\n\nCitations:\n[1] Eligibility - https://www.stevieawards.com/sales/eligibility\n[2] Entry Guidelines - https://www.stevieawards.com/sales/guidelines",
  "citations": [
    {
      "url": "https://www.stevieawards.com/sales/eligibility",
      "title": "Eligibility - Stevie Awards for Sales & Customer Service",
      "snippet": "Organizations of any size can enter..."
    },
    {
      "url": "https://www.stevieawards.com/sales/guidelines",
      "title": "Entry Guidelines",
      "snippet": "Entries accepted from all countries..."
    }
  ],
  "metadata": {
    "cacheHit": true,
    "responseTimeMs": 1234,
    "sourcesUsed": 2,
    "queryIntent": "eligibility"
  }
}
\`\`\`

**Response Fields:**
- `success` (boolean): Whether the search was successful
- `answer` (string): Comprehensive answer with inline citations [1], [2], etc.
- `citations` (array): Source URLs with titles and snippets
  - `url` (string): Source URL
  - `title` (string): Page title
  - `snippet` (string): Relevant excerpt from the page
- `metadata` (object): Request metadata
  - `cacheHit` (boolean): Whether the response was served from cache
  - `responseTimeMs` (number): Response time in milliseconds
  - `sourcesUsed` (number): Number of sources used in the answer
  - `queryIntent` (string): Detected query intent (category, eligibility, pricing, deadline, process, comparison, general)

#### Response (Error)

\`\`\`json
{
  "success": false,
  "answer": "",
  "citations": [],
  "metadata": {
    "cacheHit": false,
    "responseTimeMs": 5678,
    "sourcesUsed": 0,
    "queryIntent": "unknown"
  },
  "error": {
    "code": "CRAWL_FAILED",
    "message": "Unable to fetch information from stevieawards.com. Please try again later."
  }
}
\`\`\`

**Error Codes:**
- `VALIDATION_ERROR`: Invalid input (missing query, empty query, query too long)
- `QUEUE_FULL`: Service at capacity (too many concurrent requests)
- `CRAWL_FAILED`: Unable to fetch information from target website
- `LLM_SERVICE_UNAVAILABLE`: AI service temporarily unavailable
- `INTERNAL_ERROR`: Unexpected error occurred

#### Status Codes

- `200 OK`: Search completed successfully
- `400 Bad Request`: Invalid input (missing query, empty query, query > 1000 characters)
- `429 Too Many Requests`: Rate limit exceeded (60 requests per 15 minutes per IP)
- `503 Service Unavailable`: Queue full (service at capacity, try again later)
- `500 Internal Server Error`: Unexpected error occurred

#### Rate Limits

- **60 requests per 15 minutes per IP address**
- Separate from global API rate limits
- Returns `429 Too Many Requests` when exceeded
- Retry-After header included in 429 responses

#### Performance

- **Cached queries**: < 5 seconds response time
- **New queries**: < 15 seconds response time (includes web crawling)
- **Cache TTL**: 7 days (configurable via `AWARD_SEARCH_CACHE_TTL_DAYS`)

#### Example Usage

\`\`\`bash
curl -X POST http://localhost:3000/api/award-search \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "What categories are available in the American Business Awards?"
  }'
\`\`\`

\`\`\`javascript
// JavaScript/TypeScript
const response = await fetch('http://localhost:3000/api/award-search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'What are the pricing options for the Stevie Awards?',
    options: {
      forceRefresh: false
    }
  }),
});

const data = await response.json();
console.log(data.answer);
console.log(data.citations);
\`\`\`

#### Supported Query Types

The award search assistant can answer questions about:
- **Categories**: Available award categories and their descriptions
- **Eligibility**: Who can enter, geographic restrictions, organization size requirements
- **Pricing**: Entry fees, payment options, discounts
- **Deadlines**: Submission deadlines, judging timelines, winner announcements
- **Process**: How to enter, nomination process, judging criteria
- **Comparisons**: Differences between award programs (e.g., "What's the difference between ABA and IBA?")
- **General**: Any other questions about Stevie Awards



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

## ⚙️ Environment Variables

### Award Search Assistant Configuration

The following environment variables configure the Award Search Assistant feature:

| Variable | Default | Description |
|----------|---------|-------------|
| `AWARD_SEARCH_CACHE_TTL_DAYS` | `7` | Cache time-to-live in days. Cached search results expire after this period. |
| `AWARD_SEARCH_MAX_QUEUE_DEPTH` | `50` | Maximum number of concurrent search requests in queue. Returns 503 when exceeded. |
| `AWARD_SEARCH_CRAWLER_CONCURRENCY` | `3` | Maximum concurrent requests to stevieawards.com. Prevents overwhelming the target server. |
| `AWARD_SEARCH_CRAWLER_DELAY_MS` | `1000` | Minimum delay between requests in milliseconds (1 second). Ensures respectful crawling. |
| `AWARD_SEARCH_CRAWLER_MAX_DEPTH` | `2` | Maximum depth for following links from initial URL. |
| `AWARD_SEARCH_CRAWLER_MAX_RETRIES` | `3` | Maximum retry attempts for failed crawl requests. |
| `AWARD_SEARCH_CRAWLER_BACKOFF_BASE` | `2` | Exponential backoff base in seconds (2^n: 2s, 4s, 8s). |

### Required Environment Variables

The Award Search Assistant also requires these core environment variables:

- `OPENAI_API_KEY`: OpenAI API key for query planning and answer synthesis
- `SUPABASE_URL`: Supabase project URL for cache storage
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key for database access

### Example Configuration

\`\`\`bash
# Award Search Assistant
AWARD_SEARCH_CACHE_TTL_DAYS=7
AWARD_SEARCH_MAX_QUEUE_DEPTH=50
AWARD_SEARCH_CRAWLER_CONCURRENCY=3
AWARD_SEARCH_CRAWLER_DELAY_MS=1000
AWARD_SEARCH_CRAWLER_MAX_DEPTH=2
AWARD_SEARCH_CRAWLER_MAX_RETRIES=3
AWARD_SEARCH_CRAWLER_BACKOFF_BASE=2

# Core Services
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_key
\`\`\`

## 🛠️ Tech Stack

### Backend
- Node.js + Express
- TypeScript
- Supabase (PostgreSQL)
- Pinecone (Vector DB)
- AWS S3 (File Storage)
- Redis (Caching)
- OpenAI (Embeddings & LLM)
- Crawlee (Web Crawling)

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

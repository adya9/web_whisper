# 🎯 Web Whisper - Voice AI for Websites

## 📋 Project Overview

This project creates a voice-enabled AI assistant that can have conversations about any website's content. Users enter a URL, the system crawls and analyzes the content, then enables voice conversations about that content.

## 🔄 Complete Flow

```
1. User enters URL on homepage
   ↓
2. Frontend calls /api/crawl
   ↓
3. API calls your crawling service (localhost:8000)
   ↓
4. Process crawled data with AI
   ↓
5. Store in PostgreSQL with embeddings
   ↓
6. Redirect to voice chat interface
   ↓
7. User can ask questions via voice about the website
```

## 📁 File Structure & Purpose

### **Frontend Pages**
- `src/app/homepage/page.tsx` - Main landing page where users enter URLs
- `src/app/chatbox/page.tsx` - Voice chat interface (after crawling)
- `src/app/chatbox/VapiWidget.tsx` - Vapi voice integration component

### **API Endpoints**
- `src/app/api/crawl/route.ts` - Main crawl processing (with AI)
- `src/app/api/crawl-simple/route.ts` - Simplified crawl (for testing)
- `src/app/api/debug-crawl/route.ts` - Debug endpoint to check crawl data
- `src/app/api/search/route.ts` - Search stored content by similarity
- `src/app/api/chat/route.ts` - Chat with AI about stored content
- `src/app/api/test-db/route.ts` - Test database connection

### **AI & Database**
- `src/lib/embeddings.ts` - Google Gemini embeddings with LangChain
- `src/lib/llm.ts` - Google Gemini LLM for content analysis
- `src/lib/database-chroma.ts` - ChromaDB operations for vector storage

### **Configuration**
- `.env` - Environment variables (ChromaDB, API keys)
- `CHROMADB_SETUP.md` - ChromaDB setup guide

## 🔧 Current Status

### ✅ **What's Working**
- Frontend UI for URL input
- Database setup (PostgreSQL with tables)
- Basic crawl API structure
- Google Gemini integration setup
- Vapi voice widget integration

### ⚠️ **What Needs Debugging**
- Data storage after crawling (main issue)
- AI processing pipeline
- Voice chat integration with stored data

## 🐛 **Debugging Steps**

### Step 1: Test Your Crawl Service
```bash
# Test what your crawl service returns
curl -X POST http://localhost:3000/api/debug-crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Step 2: Test Simple Storage
```bash
# Test basic storage without AI
curl -X POST http://localhost:3000/api/crawl-simple \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Step 3: Test Database
```bash
# Test database connection
curl http://localhost:3000/api/test-db
```

## 🎯 **Next Steps**

1. **Fix Data Storage**: Ensure crawled data gets stored in database
2. **Enable AI Processing**: Get Gemini embeddings working
3. **Connect Voice Chat**: Link stored data to Vapi conversations
4. **Add Search**: Enable semantic search of stored content

## 🔑 **Key Environment Variables**

```env
# Your crawl service
CRAWL_SERVICE_URL=http://localhost:8000

# ChromaDB
CHROMA_URL=http://localhost:8000

# AI Services
GOOGLE_API_KEY=your-google-api-key
OPENAI_API_KEY=your-openai-api-key (fallback)

# Vapi (Voice) - Client-side variables
NEXT_PUBLIC_VAPI_API_KEY=your-vapi-api-key
NEXT_PUBLIC_VAPI_ASSISTANT_ID=your-vapi-assistant-id
```

## 🚀 **How to Test Right Now**

1. Start ChromaDB server: `docker run -p 8000:8000 chromadb/chroma`
2. Start your crawl service: `http://localhost:8000`
3. Start Next.js: `npm run dev`
4. Test debug endpoint: `/api/debug-crawl`
5. Test simple storage: `/api/crawl-simple`
6. Check ChromaDB: `/api/test-db`

This will help us identify exactly where the issue is in the pipeline!
# ChromaDB Setup Guide

This project now uses ChromaDB instead of PostgreSQL with pgvector for vector storage and similarity search.

## Prerequisites

1. **ChromaDB Server**: Install and run ChromaDB server
   - Docker: `docker run -p 8000:8000 chromadb/chroma`
   - Or install locally: `pip install chromadb`

## Environment Variables

Update your `.env` file:

```env
# ChromaDB Configuration
CHROMA_URL=http://localhost:8002

# AI Services (keep existing)
GOOGLE_API_KEY=your-google-api-key
OPENAI_API_KEY=your-openai-api-key

# Voice (Vapi)
apiKey=your-vapi-api-key
assistantId=your-vapi-assistant-id

# External crawler service
CRAWL_SERVICE_URL=http://localhost:8000
```

## Quick Start

1. **Start ChromaDB server**:
   ```bash
   # Using Docker (recommended)
   docker run -d --name web-whisper-chromadb -p 8002:8000 -v chroma_data:/chroma/chroma -e IS_PERSISTENT=TRUE chromadb/chroma:latest
   
   # Or use the batch file
   start-chromadb-docker.bat
   
   # Check if it's running
   docker ps --filter "name=web-whisper-chromadb"
   ```

2. **Start your Next.js app**:
   ```bash
   npm run dev
   ```

3. **Test the connection**:
   ```bash
   curl http://localhost:3000/api/test-db
   ```

## Benefits of ChromaDB

- ✅ **No PostgreSQL setup required**
- ✅ **No pgvector extension needed**
- ✅ **Built-in vector similarity search**
- ✅ **Easy to scale horizontally**
- ✅ **Simple API for vector operations**
- ✅ **Automatic embedding management**

## API Endpoints

- `/api/crawl` - Crawl and store website content
- `/api/search` - Search similar content
- `/api/chat` - Chat with AI about stored content
- `/api/test-db` - Test ChromaDB connection

## Database Schema

ChromaDB automatically handles:
- Document storage
- Vector embeddings
- Metadata storage
- Similarity search indexing

No manual schema setup required!

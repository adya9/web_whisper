# Database Setup Guide

This guide will help you set up PostgreSQL with pgvector extension for storing website content embeddings.

## Prerequisites

1. **PostgreSQL**: Install PostgreSQL on your system
   - Windows: Download from [postgresql.org](https://www.postgresql.org/download/windows/)
   - macOS: `brew install postgresql`
   - Linux: `sudo apt-get install postgresql postgresql-contrib`

2. **pgvector Extension**: Install the pgvector extension
   - Follow instructions at [pgvector GitHub](https://github.com/pgvector/pgvector)
   - Or use Docker: `docker run -d --name postgres-pgvector -e POSTGRES_PASSWORD=password -p 5432:5432 pgvector/pgvector:pg16`

## Setup Steps

### 1. Create Database
```sql
CREATE DATABASE webwhisper;
```

### 2. Update Environment Variables
Update your `.env` file with your database connection string:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/webwhisper"
GOOGLE_API_KEY="your-google-api-key-here"
OPENAI_API_KEY="your-openai-api-key-here" # Optional fallback
```

### 3. Run Database Setup Script
```bash
npm run setup-db
```

This will:
- Enable the pgvector extension
- Create the `websites` table
- Create the `content_chunks` table with vector embeddings
- Create necessary indexes for efficient similarity search

## Database Schema

### websites table
- `id`: Primary key
- `url`: Unique website URL
- `title`: Website title
- `description`: Website description
- `crawled_at`: When the website was first crawled
- `updated_at`: When the website was last updated

### content_chunks table
- `id`: Primary key
- `website_id`: Foreign key to websites table
- `content`: Text content chunk
- `embedding`: Vector embedding (768 dimensions for Google Gemini text-embedding-004)
- `metadata`: Additional metadata as JSON (includes AI-generated summaries and key points)
- `created_at`: When the chunk was created

## Usage

### Crawling and Storing
When you crawl a website using the `/api/crawl` endpoint, the system will:
1. Fetch content from your backend crawler
2. Use Google Gemini to extract key information and generate summaries
3. Split content into chunks using LangChain's RecursiveCharacterTextSplitter
4. Generate embeddings for each chunk using Google Gemini text-embedding-004
5. Store everything in PostgreSQL with pgvector including AI-enhanced metadata

### Searching
Use the `/api/search` endpoint to find similar content:
```javascript
const response = await fetch('/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'What is this website about?',
    limit: 5,
    similarityThreshold: 0.7
  })
});
```

## Troubleshooting

1. **pgvector extension not found**: Make sure pgvector is properly installed
2. **Connection refused**: Check if PostgreSQL is running
3. **Permission denied**: Ensure your database user has proper permissions
4. **Google API errors**: Verify your Google API key is valid and has Gemini API access enabled

## Performance Tips

1. **Indexing**: The setup script creates an IVFFlat index for fast similarity search
2. **Chunking**: Content is automatically chunked into ~1000 character pieces with overlap
3. **Batch Processing**: Consider processing large websites in batches to avoid rate limits
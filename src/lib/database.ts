import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;

// Initialize database with pgvector extension and tables
export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Create websites table
    await client.query(`
      CREATE TABLE IF NOT EXISTS websites (
        id SERIAL PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        description TEXT,
        crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create content_chunks table for storing text chunks and embeddings
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_chunks (
        id SERIAL PRIMARY KEY,
        website_id INTEGER REFERENCES websites(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding vector(768), -- Google Gemini text-embedding-004 dimension
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for vector similarity search
    await client.query(`
      CREATE INDEX IF NOT EXISTS content_chunks_embedding_idx 
      ON content_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Function to store website data with embeddings
export async function storeWebsiteData(
  url: string,
  title: string,
  description: string,
  contentChunks: Array<{ content: string; embedding: number[]; metadata?: any }>
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert or update website
    const websiteResult = await client.query(`
      INSERT INTO websites (url, title, description, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (url) 
      DO UPDATE SET 
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `, [url, title, description]);

    const websiteId = websiteResult.rows[0].id;

    // Delete existing content chunks for this website
    await client.query('DELETE FROM content_chunks WHERE website_id = $1', [websiteId]);

    // Insert new content chunks with embeddings
    for (const chunk of contentChunks) {
      await client.query(`
        INSERT INTO content_chunks (website_id, content, embedding, metadata)
        VALUES ($1, $2, $3, $4)
      `, [websiteId, chunk.content, JSON.stringify(chunk.embedding), chunk.metadata || {}]);
    }

    await client.query('COMMIT');
    return websiteId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Function to search similar content using vector similarity
export async function searchSimilarContent(
  queryEmbedding: number[],
  limit: number = 5,
  similarityThreshold: number = 0.7
) {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT 
        cc.content,
        cc.metadata,
        w.url,
        w.title,
        1 - (cc.embedding <=> $1::vector) as similarity
      FROM content_chunks cc
      JOIN websites w ON cc.website_id = w.id
      WHERE 1 - (cc.embedding <=> $1::vector) > $2
      ORDER BY cc.embedding <=> $1::vector
      LIMIT $3
    `, [JSON.stringify(queryEmbedding), similarityThreshold, limit]);

    return result.rows;
  } finally {
    client.release();
  }
}
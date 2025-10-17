import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;

// Initialize database without pgvector extension
export async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
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
    
    // Create content_chunks table without vector support
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_chunks (
        id SERIAL PRIMARY KEY,
        website_id INTEGER REFERENCES websites(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding_json TEXT, -- Store embeddings as JSON text
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS content_chunks_website_id_idx 
      ON content_chunks (website_id)
    `);
    
    console.log('Database initialized successfully (without pgvector)');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Function to store website data with embeddings (JSON format)
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
    
    // Insert new content chunks with embeddings as JSON
    for (const chunk of contentChunks) {
      await client.query(`
        INSERT INTO content_chunks (website_id, content, embedding_json, metadata)
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

// Function to calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Function to search similar content using JSON-based similarity
export async function searchSimilarContent(
  queryEmbedding: number[],
  limit: number = 5,
  similarityThreshold: number = 0.7
) {
  const client = await pool.connect();
  
  try {
    // Get all content chunks with their embeddings
    const result = await client.query(`
      SELECT 
        cc.content,
        cc.embedding_json,
        cc.metadata,
        w.url,
        w.title
      FROM content_chunks cc
      JOIN websites w ON cc.website_id = w.id
    `);
    
    // Calculate similarities and filter
    const similarities = result.rows
      .map(row => {
        const embedding = JSON.parse(row.embedding_json);
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        return {
          content: row.content,
          metadata: row.metadata,
          url: row.url,
          title: row.title,
          similarity,
        };
      })
      .filter(item => item.similarity > similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    return similarities;
  } finally {
    client.release();
  }
}
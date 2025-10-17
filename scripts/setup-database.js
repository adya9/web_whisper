const { Pool } = require('pg');
require('dotenv').config();

async function setupDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    console.log('Setting up database...');

    // Enable pgvector extension
    console.log('Enabling pgvector extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Create websites table
    console.log('Creating websites table...');
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

    // Create content_chunks table
    console.log('Creating content_chunks table...');
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
    console.log('Creating vector similarity index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS content_chunks_embedding_idx 
      ON content_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);

    console.log('Database setup completed successfully!');

  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();
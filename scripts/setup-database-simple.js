const { Pool } = require('pg');
require('dotenv').config();

async function setupDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    console.log('Setting up database without pgvector for now...');

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

    // Create content_chunks table without vector for now
    console.log('Creating content_chunks table (without vector support)...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_chunks (
        id SERIAL PRIMARY KEY,
        website_id INTEGER REFERENCES websites(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding_json TEXT, -- Store embeddings as JSON text for now
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for faster searches
    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS content_chunks_website_id_idx 
      ON content_chunks (website_id)
    `);

    console.log('Database setup completed successfully (without pgvector)!');
    console.log('Note: Vector similarity search will use JSON parsing instead of native pgvector');

  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();
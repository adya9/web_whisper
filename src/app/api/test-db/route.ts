import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/database-simple';

export async function GET() {
  try {
    const client = await pool.connect();
    
    try {
      // Test basic connection
      const result = await client.query('SELECT NOW() as current_time');
      
      // Check if tables exist
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      // Count records in each table
      const websitesCount = await client.query('SELECT COUNT(*) FROM websites');
      const chunksCount = await client.query('SELECT COUNT(*) FROM content_chunks');
      
      return NextResponse.json({
        status: 'Database connection successful',
        currentTime: result.rows[0].current_time,
        tables: tablesResult.rows.map(row => row.table_name),
        counts: {
          websites: parseInt(websitesCount.rows[0].count),
          contentChunks: parseInt(chunksCount.rows[0].count),
        }
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json(
      { 
        error: 'Database connection failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
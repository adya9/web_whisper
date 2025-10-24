import { NextRequest, NextResponse } from 'next/server';
import { client, getAllWebsites } from '@/lib/database-chroma';

export async function GET() {
  try {
    // Test ChromaDB connection
    const collections = await client.listCollections();
    const websites = await getAllWebsites();
    
    return NextResponse.json({
      success: true,
      message: 'ChromaDB connection successful',
      collections: collections.length,
      websites: websites.length,
      collectionNames: collections.map(col => col.name),
      websiteUrls: websites.map(w => w.url)
    });
    
  } catch (error) {
    console.error('ChromaDB test error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'ChromaDB connection failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { searchSimilarContent } from '@/lib/database-simple';
import { createQueryEmbedding } from '@/lib/embeddings';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, limit = 5, similarityThreshold = 0.7 } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Generate embedding for the search query using Gemini
    const queryEmbedding = await createQueryEmbedding(query);

    // Search for similar content
    const results = await searchSimilarContent(queryEmbedding, limit, similarityThreshold);

    return NextResponse.json({
      query,
      results,
      count: results.length,
    });

  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Failed to search content', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
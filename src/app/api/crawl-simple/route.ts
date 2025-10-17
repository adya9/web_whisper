import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, storeWebsiteData } from '@/lib/database-simple';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    console.log('🚀 Starting simple crawl process for:', url);

    // Initialize database
    await initializeDatabase();
    console.log('✅ Database initialized');

    // Call your crawling service
    const response = await fetch('http://localhost:8000/crawl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`Crawl service responded with status: ${response.status}`);
    }

    const crawledData = await response.json();
    console.log('📊 Received crawled data:', {
      hasContent: !!crawledData.content,
      contentLength: crawledData.content?.length || 0,
      title: crawledData.title
    });

    // Simple processing without AI (for testing)
    if (crawledData.content && crawledData.content.length > 0) {
      console.log('📝 Processing content for storage...');

      // Create simple chunks (split by paragraphs or every 1000 characters)
      const content = crawledData.content;
      const chunkSize = 1000;
      const chunks = [];
      
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.substring(i, i + chunkSize));
      }

      console.log(`📦 Created ${chunks.length} chunks`);

      // Create dummy embeddings (zeros) for now
      const contentChunks = chunks.map((chunk, index) => ({
        content: chunk,
        embedding: new Array(768).fill(0.1 + index * 0.001), // Simple dummy embeddings
        metadata: {
          sourceUrl: url,
          chunkIndex: index,
          totalChunks: chunks.length,
          crawledAt: new Date().toISOString(),
          contentType: crawledData.contentType || 'text/html',
        }
      }));

      // Store in database
      console.log('💾 Storing in database...');
      const websiteId = await storeWebsiteData(
        url,
        crawledData.title || 'Untitled Website',
        crawledData.description || 'No description available',
        contentChunks
      );

      console.log(`✅ Successfully stored website with ID: ${websiteId}`);

      return NextResponse.json({
        success: true,
        stored: true,
        websiteId,
        chunksStored: contentChunks.length,
        title: crawledData.title,
        description: crawledData.description,
        originalData: crawledData
      });

    } else {
      console.log('⚠️ No content found in crawled data');
      return NextResponse.json({
        success: false,
        error: 'No content found in crawled data',
        receivedData: crawledData
      });
    }

  } catch (error) {
    console.error('🚨 Simple crawl error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process crawl', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
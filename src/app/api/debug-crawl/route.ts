import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    console.log('🔍 Testing crawl service with URL:', url);

    // Call your crawling service
    const response = await fetch('http://localhost:8000/crawl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    console.log('📡 Crawl service response status:', response.status);

    if (!response.ok) {
      throw new Error(`Backend server responded with status: ${response.status}`);
    }

    const crawledData = await response.json();
    
    // Log the structure of returned data
    console.log('📊 Crawled data structure:', {
      keys: Object.keys(crawledData),
      hasContent: !!crawledData.content,
      contentType: typeof crawledData.content,
      contentLength: crawledData.content?.length || 0,
      title: crawledData.title,
      description: crawledData.description,
      sampleContent: crawledData.content?.substring(0, 200) + '...'
    });

    return NextResponse.json({
      success: true,
      dataStructure: {
        keys: Object.keys(crawledData),
        hasContent: !!crawledData.content,
        contentLength: crawledData.content?.length || 0,
      },
      sampleData: {
        title: crawledData.title,
        description: crawledData.description,
        contentPreview: crawledData.content?.substring(0, 500) + '...'
      },
      fullData: crawledData
    });

  } catch (error) {
    console.error('🚨 Debug crawl error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to debug crawl', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
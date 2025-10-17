import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, storeWebsiteData } from '@/lib/database-simple';
import { processContentForEmbeddings } from '@/lib/embeddings';
import { extractKeyInfo, summarizeContent } from '@/lib/llm';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { url } = body;

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Initialize database if not already done
        await initializeDatabase();

        // Forward the request to your backend server
        const response = await fetch('http://localhost:8000/crawl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            throw new Error(`Backend server responded with status: ${response.status}`);
        }

        const crawledData = await response.json();
        console.log('Crawled data received:', {
            hasContent: !!crawledData.content,
            contentLength: crawledData.content?.length || 0,
            title: crawledData.title,
            keys: Object.keys(crawledData)
        });

        // Process the crawled content for embeddings
        if (crawledData.content) {
            console.log('Processing content with Gemini LLM and embeddings...');

            try {
                // Extract key information using Gemini
                console.log('Extracting key info...');
                const keyInfo = await extractKeyInfo(crawledData.content);
                console.log('Key info extracted:', keyInfo);

                // Generate summary using Gemini
                console.log('Generating summary...');
                const summary = await summarizeContent(crawledData.content);
                console.log('Summary generated:', summary.substring(0, 100) + '...');

                // Process content for embeddings using LangChain + Gemini
                console.log('Processing embeddings...');
                const contentChunks = await processContentForEmbeddings(
                    crawledData.content,
                    {
                        sourceUrl: url,
                        crawledAt: new Date().toISOString(),
                        contentType: crawledData.contentType || 'text/html',
                        summary,
                        keyPoints: keyInfo.keyPoints,
                    }
                );
                console.log(`Generated ${contentChunks.length} content chunks`);

                // Store in database with enhanced metadata
                console.log('Storing in database...');
                const websiteId = await storeWebsiteData(
                    url,
                    keyInfo.title || crawledData.title || 'Untitled',
                    keyInfo.description || crawledData.description || summary,
                    contentChunks
                );

                console.log(`Successfully stored ${contentChunks.length} content chunks for website ID: ${websiteId}`);

                // Return enhanced data with AI-generated insights
                return NextResponse.json({
                    ...crawledData,
                    stored: true,
                    websiteId,
                    chunksStored: contentChunks.length,
                    aiEnhanced: {
                        title: keyInfo.title,
                        description: keyInfo.description,
                        summary,
                        keyPoints: keyInfo.keyPoints,
                    },
                });

            } catch (processingError) {
                console.error('Error processing content:', processingError);
                
                // Fallback: store basic data without AI enhancement
                try {
                    console.log('Attempting fallback storage without AI processing...');
                    const basicChunks = [{
                        content: crawledData.content.substring(0, 1000), // Just take first 1000 chars
                        embedding: new Array(768).fill(0), // Dummy embedding
                        metadata: {
                            sourceUrl: url,
                            crawledAt: new Date().toISOString(),
                            contentType: crawledData.contentType || 'text/html',
                            fallback: true,
                        }
                    }];

                    const websiteId = await storeWebsiteData(
                        url,
                        crawledData.title || 'Untitled',
                        crawledData.description || 'No description',
                        basicChunks
                    );

                    console.log(`Fallback storage successful for website ID: ${websiteId}`);

                    return NextResponse.json({
                        ...crawledData,
                        stored: true,
                        websiteId,
                        chunksStored: basicChunks.length,
                        fallback: true,
                        processingError: processingError instanceof Error ? processingError.message : 'Unknown processing error',
                    });

                } catch (storageError) {
                    console.error('Fallback storage also failed:', storageError);
                    throw storageError;
                }
            }
        } else {
            console.log('No content found in crawled data, skipping storage');
        }

        return NextResponse.json(crawledData);

    } catch (error) {
        console.error('Crawl API error:', error);
        return NextResponse.json(
            { error: 'Failed to crawl website', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
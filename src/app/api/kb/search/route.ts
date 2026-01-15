import { NextRequest, NextResponse } from 'next/server';
import { searchSimilarContent, checkCollectionData } from '@/lib/database-milvus';
import { createQueryEmbedding } from '@/lib/embeddings';
import crypto from 'crypto';

// Handle CORS preflight
export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-vapi-signature',
    },
  });
}

// Verify webhook signature (optional)
function verifyWebhookSignature(body: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) {
    // If signature or secret not provided, skip verification
    return true;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    return signature === `sha256=${expectedSignature}`;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

// Extract the latest user message from conversation history
function extractLatestUserMessage(messages: Array<{ role: string; content: string }>): string | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  // Find the most recent user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].content) {
      return messages[i].content.trim();
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const bodyText = await request.text();
    let body: any;
    
    try {
      body = JSON.parse(bodyText);
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return NextResponse.json({ documents: [] });
    }

    // Verify webhook signature (optional - only if secret is configured)
    const signature = request.headers.get('x-vapi-signature');
    const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      if (!verifyWebhookSignature(bodyText, signature, webhookSecret)) {
        console.warn('Invalid webhook signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    // Validate request format
    if (!body.message || body.message.type !== 'knowledge-base-request') {
      console.log('Invalid request type, returning empty documents');
      return NextResponse.json({ documents: [] });
    }

    // Extract latest user message from conversation
    const messages = body.message.messages || [];
    const query = extractLatestUserMessage(messages);

    if (!query) {
      console.log('No user message found in conversation, returning empty documents');
      return NextResponse.json({ documents: [] });
    }

    console.log(`Vapi knowledge base query: "${query}"`);

    // Check if collection has data
    const collectionStatus = await checkCollectionData();
    if (!collectionStatus.hasData) {
      console.log('No data in collection, returning empty documents');
      return NextResponse.json({ documents: [] });
    }

    // Generate embedding for the query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await createQueryEmbedding(query);
      console.log(`Query embedding generated: ${queryEmbedding.length} dimensions`);
    } catch (error) {
      console.error('Error generating query embedding:', error);
      return NextResponse.json({ documents: [] });
    }

    // Search Milvus for relevant content
    const relevantContent = await searchSimilarContent(
      queryEmbedding,
      5, // maxResults: Vapi typically expects 3-5 documents
      0.2 // similarityThreshold: same as chat endpoint
    );

    console.log(`Found ${relevantContent.length} relevant documents for Vapi`);

    // Format results for Vapi
    const documents = relevantContent.map((item: any) => ({
      content: item.content || '',
      similarity: item.similarity || 0,
      uuid: item.metadata?.id?.toString() || item.url || undefined, // Optional unique identifier
    }));

    return NextResponse.json(
      { documents },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-vapi-signature',
        },
      }
    );

  } catch (error) {
    console.error('Error in Vapi knowledge base search:', error);
    // Return empty documents on any error (don't fail the request)
    return NextResponse.json(
      { documents: [] },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-vapi-signature',
        },
      }
    );
  }
}

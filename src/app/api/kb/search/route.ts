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

// Clean up query text - handle fragmented transcriptions
function cleanQuery(query: string): string {
  if (!query) return query;
  
  // Remove extra spaces and normalize (but preserve single spaces between words)
  let cleaned = query.trim().replace(/\s+/g, ' ');
  
  // Only fix letter-by-letter spelling patterns - be very specific to avoid breaking normal text
  // Pattern: Match sequences like "a x c e n d" or "a, x, c, e, n, d" where each is a single letter
  // We need to be careful to only match actual letter-by-letter sequences, not normal words
  
  // Pattern 1: "word, a x c e n d?" -> "word axcend"
  // Match: word followed by comma/space, then 3+ single letters separated by spaces/commas
  const wordThenLetters = /(\b\w+\b)\s*[,]?\s*((?:[a-z]\s+){2,}[a-z]\s*[?.,!]?)/gi;
  cleaned = cleaned.replace(wordThenLetters, (match, word, letters) => {
    // Check if this is actually a letter sequence (each part should be a single letter)
    const letterParts = letters.trim().split(/[\s,]+/).filter(p => p.length > 0);
    const isLetterSequence = letterParts.length >= 3 && 
      letterParts.every(part => part.length === 1 && /[a-z]/i.test(part.replace(/[?.,!]/g, '')));
    
    if (isLetterSequence) {
      const combined = letterParts.map(p => p.replace(/[?.,!]/g, '')).join('').toLowerCase();
      return `${word} ${combined}`;
    }
    return match;
  });
  
  // Pattern 2: Standalone letter sequences "a x c e n d?" -> "axcend"
  // Match: 3+ single letters separated by spaces, at word boundaries
  const letterSequence = /\b((?:[a-z]\s+){2,}[a-z]\s*[?.,!]?)\b/gi;
  cleaned = cleaned.replace(letterSequence, (match) => {
    const letterParts = match.trim().split(/\s+/).filter(p => p.length > 0);
    const isLetterSequence = letterParts.length >= 3 && 
      letterParts.every(part => part.length === 1 && /[a-z]/i.test(part.replace(/[?.,!]/g, '')));
    
    if (isLetterSequence) {
      return letterParts.map(p => p.replace(/[?.,!]/g, '')).join('').toLowerCase();
    }
    return match;
  });
  
  // Final normalization - ensure single spaces between words (but don't remove all spaces!)
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

// Extract the latest user message from conversation history
function extractLatestUserMessage(messages: Array<{ role: string; content: string }>): string | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  // Find the most recent user message
  // Try different role formats: 'user', 'User', 'USER', or check for any message with content
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;
    
    const role = msg.role?.toLowerCase();
    const content = msg.content || msg.text || msg.message;
    
    // Check for user role (case-insensitive)
    if ((role === 'user' || role === 'caller') && content) {
      return String(content).trim();
    }
  }

  // Fallback: if no user message found, try to get the last message with content
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;
    
    const content = msg.content || msg.text || msg.message;
    if (content) {
      return String(content).trim();
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

    // Debug: Log the full request body to understand Vapi's format
    console.log('Vapi request body:', JSON.stringify(body, null, 2));

    // Validate request format
    if (!body.message || body.message.type !== 'knowledge-base-request') {
      console.log('Invalid request type, returning empty documents');
      console.log('Request body structure:', {
        hasMessage: !!body.message,
        messageType: body.message?.type,
        fullBody: Object.keys(body)
      });
      return NextResponse.json({ documents: [] });
    }

    // Prefer messagesOpenAIFormatted as it has the complete, combined user message
    let query: string | null = null;
    
    // First try: Use messagesOpenAIFormatted (cleaner, combined messages)
    const openAIMessages = body.message?.messagesOpenAIFormatted || body.message?.artifact?.messagesOpenAIFormatted || [];
    if (openAIMessages.length > 0) {
      // Find the last user message in OpenAI format
      for (let i = openAIMessages.length - 1; i >= 0; i--) {
        const msg = openAIMessages[i];
        if (msg?.role === 'user' && msg?.content) {
          query = String(msg.content).trim();
          console.log('Found query from messagesOpenAIFormatted:', query);
          break;
        }
      }
    }
    
    // Fallback: Extract from regular messages array
    if (!query) {
      const messages = body.message.messages || [];
      console.log('Messages array:', JSON.stringify(messages, null, 2));
      console.log('Messages count:', messages.length);
      query = extractLatestUserMessage(messages);
    }

    // Final fallback: Check other locations
    if (!query) {
      query = body.message?.query || body.query || body.message?.content;
      if (query) {
        console.log('Found query in alternative location:', query);
        query = String(query).trim();
      }
    }

    if (!query) {
      console.log('No user message found in conversation, returning empty documents');
      const messages = body.message?.messages || [];
      console.log('Messages structure:', messages.map((m: any) => ({ role: m?.role, hasContent: !!(m?.content || m?.message) })));
      console.log('Full body keys:', Object.keys(body));
      return NextResponse.json({ documents: [] });
    }

    // Clean up the query to handle fragmented transcriptions
    query = cleanQuery(query);
    console.log(`Vapi knowledge base query (cleaned): "${query}"`);

    // Skip very short queries (less than 2 characters) - they won't match anything useful
    if (query.trim().length < 2) {
      console.log(`Query "${query}" is too short, returning empty documents`);
      return NextResponse.json({ documents: [] });
    }

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
    // Use a very permissive threshold (-1.0) since L2 distances > 1 result in negative similarities
    // The search function will return top results anyway if threshold filtering removes everything
    const relevantContent = await searchSimilarContent(
      queryEmbedding,
      5, // maxResults: Vapi typically expects 3-5 documents
      -1.0 // similarityThreshold: very permissive to allow negative similarities from L2 distance
    );

    console.log(`Found ${relevantContent.length} relevant documents for Vapi`);

    // Format results for Vapi
    const documents = relevantContent.map((item: any, index: number) => {
      const content = item.content || '';
      const doc = {
        content: content,
        similarity: item.similarity || 0,
        uuid: item.metadata?.id?.toString() || item.url || undefined,
      };
      
      // Log each document being sent (first 200 chars of content)
      console.log(`  Document ${index + 1}: similarity=${doc.similarity.toFixed(3)}, content_length=${content.length}, preview="${content.substring(0, 200)}..."`);
      
      return doc;
    });

    console.log(`Sending ${documents.length} documents to Vapi`);

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

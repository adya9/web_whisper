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

    // Extract key terms from the query for better search
    // Focus on names, important nouns, and key phrases
    function extractKeyTerms(text: string): string {
      // Remove common stop words but keep important terms
      const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 
        'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 
        'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
        'what', 'where', 'when', 'why', 'how', 'tell', 'me', 'about', 'am',
        'not', 'no', 'yes', 'yeah', 'um', 'uh'
      ]);
      
      // First, try to extract capitalized names (proper nouns) - these are usually important
      const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
      
      // Then get other important words
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));
      
      // Combine capitalized names (which are likely important) with other key terms
      const allTerms = [
        ...capitalizedWords.map(w => w.toLowerCase()), // Add names
        ...words // Add other important words
      ];
      
      // Remove duplicates and return top terms
      const uniqueTerms = Array.from(new Set(allTerms));
      
      // Prioritize longer terms and return top 8-10 terms for better coverage
      return uniqueTerms
        .sort((a, b) => b.length - a.length) // Longer words first
        .slice(0, 10) // Top 10 key terms for better search coverage
        .join(' ');
    }

    // Create a focused search query from key terms
    // BUT: If query contains a name (capitalized words) or is short, use original query
    const hasName = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/.test(query); // Detects multi-word capitalized names
    const isShortQuery = query.split(/\s+/).length <= 5; // Short queries (5 words or less)
    
    let searchQuery: string;
    if (hasName || isShortQuery) {
      // For queries with names or short queries, use the original query
      // Key term extraction might remove important context
      searchQuery = query;
      console.log(`Using original query (contains name or is short): "${searchQuery}"`);
    } else {
      // For longer queries, extract key terms to focus the search
      const keyTerms = extractKeyTerms(query);
      searchQuery = keyTerms || query;
      console.log(`Extracted key terms for search: "${searchQuery}"`);
    }

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

    // Generate embedding for the search query (use key terms if available, otherwise original query)
    let queryEmbedding: number[];
    try {
      // Use the focused search query (key terms) for better semantic matching
      queryEmbedding = await createQueryEmbedding(searchQuery);
      console.log(`Query embedding generated from "${searchQuery}": ${queryEmbedding.length} dimensions`);
    } catch (error) {
      console.error('Error generating query embedding:', error);
      return NextResponse.json({ documents: [] });
    }

    // Search Milvus for relevant content
    // Use a more reasonable threshold (0.2) to match chat endpoint behavior
    // This will filter out very poor matches while still allowing negative similarities
    // Increase maxResults significantly to get more candidates, especially for name searches
    const maxSearchResults = hasName ? 15 : 10; // More results for name searches
    const relevantContent = await searchSimilarContent(
      queryEmbedding,
      maxSearchResults, // Get more candidates to find better matches
      0.2 // similarityThreshold: Match chat endpoint threshold for consistency
    );

    console.log(`Found ${relevantContent.length} relevant documents for Vapi`);

    // Sort by similarity (highest first) and take top documents for Vapi
    // Return more documents for name searches to increase chances of finding the person
    const topCount = hasName ? 7 : 5; // More documents for name searches
    const topDocuments = relevantContent
      .sort((a: any, b: any) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, topCount);

    console.log(`Returning top ${topDocuments.length} documents to Vapi (sorted by similarity, hasName: ${hasName})`);

    // Format results for Vapi
    // Include title and URL in content for better context (helps LLM understand the source)
    const documents = topDocuments.map((item: any, index: number) => {
      const baseContent = item.content || '';
      const title = item.title || item.metadata?.title || '';
      const url = item.url || item.metadata?.url || '';
      
      // Enhance content with title and URL context for better LLM understanding
      let enhancedContent = baseContent;
      if (title) {
        enhancedContent = `[From: ${title}]\n${enhancedContent}`;
      }
      if (url && !enhancedContent.includes(url)) {
        enhancedContent = `${enhancedContent}\n[Source: ${url}]`;
      }
      
      const doc = {
        content: enhancedContent,
        similarity: item.similarity || 0,
        uuid: item.metadata?.id?.toString() || url || undefined,
      };
      
      // Log each document being sent (first 200 chars of content)
      console.log(`  Document ${index + 1}: similarity=${doc.similarity.toFixed(3)}, content_length=${enhancedContent.length}, title="${title}", preview="${enhancedContent.substring(0, 200)}..."`);
      
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

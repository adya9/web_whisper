import { NextRequest, NextResponse } from 'next/server';
import { searchSimilarContent, checkCollectionData } from '@/lib/database-chroma';
import { createQueryEmbedding } from '@/lib/embeddings';
import { answerQuestion, generateVoiceResponse } from '@/lib/llm';

// Handle CORS preflight
export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// Check if message is a greeting
function isGreeting(message: string): boolean {
  const greetings = [
    'hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 
    'good evening', 'howdy', 'what\'s up', 'sup', 'yo', 'hola', 'namaste',
    'how are you', 'how do you do', 'nice to meet you'
  ];
  
  const normalizedMessage = message.toLowerCase().trim();
  return greetings.some(greeting => 
    normalizedMessage === greeting || 
    normalizedMessage.startsWith(greeting + ' ') ||
    normalizedMessage.includes(greeting)
  );
}

// Generate greeting response
function getGreetingResponse(): string {
  const responses = [
    "Hello! I'm here to help you learn about the website content that was crawled. What would you like to know?",
    "Hi there! I can answer questions about the website content. What would you like to ask?",
    "Hey! I'm ready to help you explore the crawled website content. What questions do you have?",
    "Hello! Feel free to ask me anything about the website content. How can I assist you today?",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      message, 
      conversationHistory = [], 
      isVoiceChat = false,
      similarityThreshold = 0.2, // Very low threshold (0.2 = 80% distance) to catch more results
      maxResults = 5 
    } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Handle greetings
    if (isGreeting(message)) {
      return NextResponse.json({
        response: getGreetingResponse(),
        relevantContent: [],
        sources: [],
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Check if collection has data first
    const collectionStatus = await checkCollectionData();
    if (!collectionStatus.hasData) {
      return NextResponse.json({
        response: "I don't have any website content stored yet. Please crawl a website first from the homepage.",
        relevantContent: [],
        sources: [],
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Generate embedding for the user's message
    const messageEmbedding = await createQueryEmbedding(message);
    console.log(`Query embedding generated: ${messageEmbedding.length} dimensions`);

    // Search for relevant content
    const relevantContent = await searchSimilarContent(
      messageEmbedding, 
      maxResults, 
      similarityThreshold
    );
    
    console.log(`Found ${relevantContent.length} relevant content chunks`);

    // If no relevant content found, provide helpful response
    if (relevantContent.length === 0) {
      return NextResponse.json({
        response: "I don't have enough information about this topic from the crawled website content. Could you try asking about something else or provide more context?",
        relevantContent: [],
        sources: [],
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Extract content text and sources
    const contentTexts = relevantContent.map(item => item.content);
    const sources = relevantContent.map(item => ({
      url: item.url,
      title: item.title,
      similarity: item.similarity,
    }));

    // Generate response using appropriate method
    let response: string;
    if (isVoiceChat) {
      response = await generateVoiceResponse(message, contentTexts, conversationHistory);
    } else {
      response = await answerQuestion(message, contentTexts);
    }

    // Return response in format that Vapi can use
    const responseData = {
      response, // Main response text for Vapi
      relevantContent: contentTexts,
      sources,
      conversationHistory: [...conversationHistory, `User: ${message}`, `Assistant: ${response}`],
    };

    return NextResponse.json(responseData, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process chat message', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

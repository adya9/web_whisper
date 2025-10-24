import { NextRequest, NextResponse } from 'next/server';
import { searchSimilarContent } from '@/lib/database-chroma';
import { createQueryEmbedding } from '@/lib/embeddings';
import { answerQuestion, generateVoiceResponse } from '@/lib/llm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      message, 
      conversationHistory = [], 
      isVoiceChat = false,
      similarityThreshold = 0.7,
      maxResults = 5 
    } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Generate embedding for the user's message
    const messageEmbedding = await createQueryEmbedding(message);

    // Search for relevant content
    const relevantContent = await searchSimilarContent(
      messageEmbedding, 
      maxResults, 
      similarityThreshold
    );

    if (relevantContent.length === 0) {
      return NextResponse.json({
        response: "I don't have enough information about this topic from the crawled website content. Could you try asking about something else or provide more context?",
        relevantContent: [],
        sources: [],
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

    return NextResponse.json({
      response,
      relevantContent: contentTexts,
      sources,
      conversationHistory: [...conversationHistory, `User: ${message}`, `Assistant: ${response}`],
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
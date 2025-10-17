import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

// Initialize Google Gemini LLM
const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-1.5-pro', // Latest Gemini model
  temperature: 0.7,
  maxOutputTokens: 2048,
});

// Output parser to get clean string responses
const outputParser = new StringOutputParser();

// Template for answering questions based on website content
const qaTemplate = PromptTemplate.fromTemplate(`
You are an AI assistant that helps users understand website content. You have access to relevant content chunks from a website that the user is asking about.

Context from the website:
{context}

User Question: {question}

Instructions:
- Answer the question based on the provided context from the website
- If the context doesn't contain enough information to answer the question, say so clearly
- Be concise but informative
- Use a conversational tone
- If relevant, mention specific details from the website content

Answer:
`);

// Template for summarizing website content
const summaryTemplate = PromptTemplate.fromTemplate(`
You are an AI assistant that creates concise summaries of website content.

Website Content:
{content}

Create a comprehensive but concise summary of this website content. Include:
- Main purpose/topic of the website
- Key features or services mentioned
- Important details or highlights
- Target audience (if apparent)

Summary:
`);

// Function to answer questions based on website content
export async function answerQuestion(question: string, relevantContent: string[]): Promise<string> {
  try {
    const context = relevantContent.join('\n\n---\n\n');
    
    const chain = qaTemplate.pipe(llm).pipe(outputParser);
    
    const response = await chain.invoke({
      context,
      question,
    });
    
    return response;
  } catch (error) {
    console.error('Error answering question with Gemini:', error);
    throw error;
  }
}

// Function to summarize website content
export async function summarizeContent(content: string): Promise<string> {
  try {
    const chain = summaryTemplate.pipe(llm).pipe(outputParser);
    
    const response = await chain.invoke({
      content: content.substring(0, 10000), // Limit content length for summary
    });
    
    return response;
  } catch (error) {
    console.error('Error summarizing content with Gemini:', error);
    throw error;
  }
}

// Function to generate a conversational response for voice chat
export async function generateVoiceResponse(
  userMessage: string, 
  relevantContent: string[], 
  conversationHistory: string[] = []
): Promise<string> {
  try {
    const context = relevantContent.join('\n\n---\n\n');
    const history = conversationHistory.length > 0 
      ? `Previous conversation:\n${conversationHistory.slice(-4).join('\n')}\n\n` 
      : '';
    
    const voiceTemplate = PromptTemplate.fromTemplate(`
You are a helpful AI assistant having a voice conversation with a user about a website they're interested in. 

${history}Website Context:
{context}

User: {message}

Instructions:
- Respond in a natural, conversational tone suitable for voice interaction
- Keep responses concise but informative (2-3 sentences max)
- Use the website context to provide accurate information
- If you don't have enough information, ask clarifying questions
- Be friendly and engaging

Response:
`);
    
    const chain = voiceTemplate.pipe(llm).pipe(outputParser);
    
    const response = await chain.invoke({
      context,
      message: userMessage,
    });
    
    return response;
  } catch (error) {
    console.error('Error generating voice response with Gemini:', error);
    throw error;
  }
}

// Function to extract key information from website content
export async function extractKeyInfo(content: string): Promise<{
  title: string;
  description: string;
  keyPoints: string[];
}> {
  try {
    const extractTemplate = PromptTemplate.fromTemplate(`
Analyze the following website content and extract key information:

Content:
{content}

Extract and return in this exact format:
TITLE: [Main title or purpose of the website]
DESCRIPTION: [Brief description in 1-2 sentences]
KEY_POINTS: [List 3-5 key points, separated by | ]

Response:
`);
    
    const chain = extractTemplate.pipe(llm).pipe(outputParser);
    
    const response = await chain.invoke({
      content: content.substring(0, 8000), // Limit content length
    });
    
    // Parse the structured response
    const lines = response.split('\n');
    const title = lines.find(line => line.startsWith('TITLE:'))?.replace('TITLE:', '').trim() || 'Website';
    const description = lines.find(line => line.startsWith('DESCRIPTION:'))?.replace('DESCRIPTION:', '').trim() || '';
    const keyPointsLine = lines.find(line => line.startsWith('KEY_POINTS:'))?.replace('KEY_POINTS:', '').trim() || '';
    const keyPoints = keyPointsLine ? keyPointsLine.split('|').map(point => point.trim()).filter(Boolean) : [];
    
    return {
      title,
      description,
      keyPoints,
    };
  } catch (error) {
    console.error('Error extracting key info with Gemini:', error);
    return {
      title: 'Website',
      description: 'Unable to extract description',
      keyPoints: [],
    };
  }
}
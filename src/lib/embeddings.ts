import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// Initialize Google Gemini embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'text-embedding-004', // Latest Gemini embedding model
});

// Initialize text splitter with LangChain
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', ''],
});

// Function to generate embeddings for text using Google Gemini
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embedding = await embeddings.embedQuery(text);
    return embedding;
  } catch (error) {
    console.error('Error generating embedding with Gemini:', error);
    throw error;
  }
}

// Function to generate embeddings for multiple texts (batch processing)
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const embeddings_result = await embeddings.embedDocuments(texts);
    return embeddings_result;
  } catch (error) {
    console.error('Error generating batch embeddings with Gemini:', error);
    throw error;
  }
}

// Function to chunk text using LangChain's RecursiveCharacterTextSplitter
export async function chunkText(text: string): Promise<string[]> {
  try {
    const chunks = await textSplitter.splitText(text);
    return chunks.filter(chunk => chunk.trim().length > 10); // Filter out very short chunks
  } catch (error) {
    console.error('Error chunking text:', error);
    throw error;
  }
}

// Function to process crawled content and generate embeddings with batch processing
export async function processContentForEmbeddings(content: string, metadata: any = {}) {
  try {
    // Split content into chunks using LangChain
    const chunks = await chunkText(content);
    
    if (chunks.length === 0) {
      console.warn('No valid chunks generated from content');
      return [];
    }

    console.log(`Processing ${chunks.length} chunks for embeddings...`);
    
    // Generate embeddings for all chunks in batch (more efficient)
    const embeddings_batch = await generateEmbeddings(chunks);
    
    // Combine chunks with their embeddings
    const chunksWithEmbeddings = chunks.map((chunk, index) => ({
      content: chunk,
      embedding: embeddings_batch[index],
      metadata: {
        ...metadata,
        chunkLength: chunk.length,
        chunkIndex: index,
        totalChunks: chunks.length,
        processedAt: new Date().toISOString(),
      },
    }));
    
    console.log(`Successfully processed ${chunksWithEmbeddings.length} chunks with embeddings`);
    return chunksWithEmbeddings;
    
  } catch (error) {
    console.error('Error processing content for embeddings:', error);
    throw error;
  }
}

// Function to create embeddings for search queries
export async function createQueryEmbedding(query: string): Promise<number[]> {
  try {
    return await generateEmbedding(query);
  } catch (error) {
    console.error('Error creating query embedding:', error);
    throw error;
  }
}
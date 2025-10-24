import { ChromaClient } from 'chromadb';

// Initialize ChromaDB client
const client = new ChromaClient({
  path: process.env.CHROMA_URL || 'http://localhost:8002'
});

const COLLECTION_NAME = 'web_whisper_content';

// Initialize ChromaDB collection
export async function initializeDatabase() {
  try {
    // Check if collection exists, if not create it
    const collections = await client.listCollections();
    const collectionExists = collections.some(col => col.name === COLLECTION_NAME);
    
    if (!collectionExists) {
      // Create collection without embedding function (we'll provide pre-computed embeddings)
      await client.createCollection({
        name: COLLECTION_NAME,
        metadata: { description: 'Web Whisper content chunks with embeddings' }
      });
      console.log(`Created ChromaDB collection: ${COLLECTION_NAME}`);
    } else {
      console.log(`Using existing ChromaDB collection: ${COLLECTION_NAME}`);
    }
    
    console.log('ChromaDB initialized successfully');
  } catch (error) {
    console.error('Error initializing ChromaDB:', error);
    throw error;
  }
}

// Function to store website data with embeddings in ChromaDB
export async function storeWebsiteData(
  url: string,
  title: string,
  description: string,
  contentChunks: Array<{ content: string; embedding: number[]; metadata?: any }>
) {
  try {
    const collection = await client.getCollection({ name: COLLECTION_NAME });
    
    // Prepare documents, embeddings, and metadata for ChromaDB
    const documents = contentChunks.map(chunk => chunk.content);
    const embeddings = contentChunks.map(chunk => chunk.embedding);
    const metadatas = contentChunks.map((chunk, index) => ({
      url: url,
      title: title || 'Untitled',
      description: description || 'No description',
      chunkIndex: index,
      totalChunks: contentChunks.length,
      crawledAt: new Date().toISOString(),
      // Only include primitive metadata values
      sourceUrl: chunk.metadata?.sourceUrl || url,
      contentType: chunk.metadata?.contentType || 'text/html',
      chunkLength: chunk.metadata?.chunkLength || chunk.content.length
    }));
    const ids = contentChunks.map((_, index) => `${url}_chunk_${index}_${Date.now()}`);
    
    // Add documents to ChromaDB
    await collection.add({
      ids,
      documents,
      embeddings,
      metadatas
    });
    
    console.log(`Successfully stored ${contentChunks.length} chunks for website: ${url}`);
    return { success: true, chunksStored: contentChunks.length };
    
  } catch (error) {
    console.error('Error storing website data in ChromaDB:', error);
    throw error;
  }
}

// Function to search similar content using ChromaDB
export async function searchSimilarContent(
  queryEmbedding: number[],
  limit: number = 5,
  similarityThreshold: number = 0.7
) {
  try {
    const collection = await client.getCollection({ name: COLLECTION_NAME });
    
    // Query ChromaDB for similar content
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      where: {} // You can add filters here if needed
    });
    
    // Process results to match expected format
    const similarities = results.documents[0].map((doc, index) => ({
      content: doc,
      metadata: results.metadatas[0][index],
      url: results.metadatas[0][index]?.url || '',
      title: results.metadatas[0][index]?.title || '',
      similarity: results.distances[0][index] ? (1 - results.distances[0][index]) : 0 // Convert distance to similarity
    })).filter(item => item.similarity > similarityThreshold);
    
    return similarities;
    
  } catch (error) {
    console.error('Error searching similar content in ChromaDB:', error);
    throw error;
  }
}

// Function to get all websites from ChromaDB
export async function getAllWebsites() {
  try {
    const collection = await client.getCollection({ name: COLLECTION_NAME });
    
    // Get all documents to extract unique websites
    const results = await collection.get({
      include: ['metadatas']
    });
    
    // Group by URL to get unique websites
    const websites = new Map();
    results.metadatas.forEach(metadata => {
      if (metadata && metadata.url) {
        websites.set(metadata.url, {
          url: metadata.url,
          title: metadata.title || 'Untitled',
          description: metadata.description || '',
          crawledAt: metadata.crawledAt
        });
      }
    });
    
    return Array.from(websites.values());
    
  } catch (error) {
    console.error('Error getting websites from ChromaDB:', error);
    throw error;
  }
}

// Function to delete website data from ChromaDB
export async function deleteWebsiteData(url: string) {
  try {
    const collection = await client.getCollection({ name: COLLECTION_NAME });
    
    // Get all documents for this URL
    const results = await collection.get({
      where: { url: url },
      include: ['ids']
    });
    
    if (results.ids.length > 0) {
      await collection.delete({
        ids: results.ids
      });
      console.log(`Deleted ${results.ids.length} chunks for website: ${url}`);
    }
    
    return { success: true, deletedChunks: results.ids.length };
    
  } catch (error) {
    console.error('Error deleting website data from ChromaDB:', error);
    throw error;
  }
}

// Export ChromaDB client for direct access if needed
export { client };

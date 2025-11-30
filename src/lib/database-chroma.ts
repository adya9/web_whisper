import { ChromaClient } from 'chromadb';

// Initialize ChromaDB client
const client = new ChromaClient({
  path: process.env.CHROMA_URL || 'http://localhost:8002'
});

const COLLECTION_NAME = 'web_whisper_content';

// Initialize ChromaDB collection
export async function initializeDatabase() {
  try {
    // Check if collection exists
    const collections = await client.listCollections();
    const collectionExists = collections.some(col => col.name === COLLECTION_NAME);
    
    if (!collectionExists) {
      // Create collection without embedding function (we provide pre-computed embeddings)
      // This avoids the warning about undefined embedding function
      await client.createCollection({
        name: COLLECTION_NAME,
        metadata: { description: 'Web Whisper content chunks with embeddings' }
        // Explicitly not setting embeddingFunction - we provide embeddings directly
      });
      
      console.log(`Created ChromaDB collection: ${COLLECTION_NAME} (without embedding function)`);
    } else {
      console.log(`Using existing ChromaDB collection: ${COLLECTION_NAME}`);
      // Note: If you see a warning about undefined embedding function, it's harmless
      // since we provide embeddings directly in add() and query() operations
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
    
    // Validate embeddings before adding
    const validEmbeddings = embeddings.map((emb, idx) => {
      if (!Array.isArray(emb) || emb.length === 0) {
        throw new Error(`Invalid embedding at index ${idx}: must be a non-empty array of numbers`);
      }
      return emb;
    });
    
    console.log(`Adding ${validEmbeddings.length} documents with embeddings (dimension: ${validEmbeddings[0]?.length || 'unknown'})`);
    
    // Add documents to ChromaDB with embeddings
    await collection.add({
      ids,
      documents,
      embeddings: validEmbeddings, // Explicitly provide embeddings
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
  similarityThreshold: number = 0.5
) {
  try {
    const collection = await client.getCollection({ name: COLLECTION_NAME });
    
    // Validate query embedding
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new Error('Invalid query embedding: must be a non-empty array of numbers');
    }
    
    console.log(`Searching with embedding dimension: ${queryEmbedding.length}`);
    
    // Query ChromaDB for similar content
    // Explicitly provide queryEmbeddings (not queryTexts) since we're using pre-computed embeddings
    const queryParams: any = {
      queryEmbeddings: [queryEmbedding], // Provide embedding directly
      nResults: limit,
      include: ['documents', 'metadatas', 'distances'] // Explicitly include what we need
    };
    
    const results = await collection.query(queryParams);
    
    console.log('Query results:', {
      hasDocuments: !!results.documents,
      documentsLength: results.documents?.[0]?.length || 0,
      hasDistances: !!results.distances,
      distancesLength: results.distances?.[0]?.length || 0,
      hasMetadatas: !!results.metadatas,
      metadatasLength: results.metadatas?.[0]?.length || 0
    });
    
    // Check if we got results
    if (!results.documents || !results.documents[0] || results.documents[0].length === 0) {
      console.log('No documents found in ChromaDB query');
      return [];
    }
    
    // Process results to match expected format
    const allResults = results.documents[0].map((doc, index) => {
      const distance = results.distances?.[0]?.[index] ?? 1;
      const similarity = 1 - distance; // Convert distance to similarity
      
      return {
        content: doc || '',
        metadata: results.metadatas?.[0]?.[index] || {},
        url: results.metadatas?.[0]?.[index]?.url || '',
        title: results.metadatas?.[0]?.[index]?.title || '',
        similarity: similarity,
        distance: distance
      };
    });
    
    // Log all results before filtering
    console.log(`Found ${allResults.length} total results before filtering:`);
    allResults.forEach((result, idx) => {
      console.log(`  Result ${idx + 1}: similarity=${result.similarity.toFixed(3)}, distance=${result.distance.toFixed(3)}, url=${result.url}`);
    });
    
    // Filter by threshold
    let filteredResults = allResults.filter(item => item.similarity >= similarityThreshold);
    
    console.log(`After filtering (threshold: ${similarityThreshold}): ${filteredResults.length} results`);
    
    // If no results after filtering, return top results anyway (they're the best we have)
    if (filteredResults.length === 0 && allResults.length > 0) {
      console.log(`No results passed threshold ${similarityThreshold}, but returning top ${Math.min(3, allResults.length)} results anyway (best matches available)`);
      filteredResults = allResults.slice(0, Math.min(3, allResults.length));
    }
    
    return filteredResults.map(r => ({
      content: r.content,
      metadata: r.metadata,
      url: r.url,
      title: r.title,
      similarity: r.similarity
    }));
    
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
      where: { url: url }
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

// Function to check if collection has data
export async function checkCollectionData() {
  try {
    const collection = await client.getCollection({ name: COLLECTION_NAME });
    const results = await collection.get({
      limit: 1,
      include: ['documents', 'metadatas']
    });
    
    return {
      hasData: results.ids.length > 0,
      count: results.ids.length,
      sample: results.ids.length > 0 ? {
        id: results.ids[0],
        hasDocument: !!results.documents?.[0],
        metadata: results.metadatas?.[0]
      } : null
    };
  } catch (error) {
    console.error('Error checking collection data:', error);
    return { hasData: false, count: 0, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Export ChromaDB client for direct access if needed
export { client };

import { MilvusClient, DataType, IndexType, MetricType } from '@zilliz/milvus2-sdk-node';

const DATABASE_NAME = 'web_whisper';
const COLLECTION_NAME = 'ragProj';
const EMBEDDING_DIMENSION = 768; // Google Gemini text-embedding-004

// Initialize Milvus client
const client = new MilvusClient({
  address: `${process.env.MILVUS_HOST || 'localhost'}:${process.env.MILVUS_PORT || '19530'}`,
});

// Define schema for the collection
const collectionSchema = [
  {
    name: 'id',
    description: 'Primary key',
    data_type: DataType.Int64,
    is_primary_key: true,
    autoID: false, // We'll generate IDs ourselves
  },
  {
    name: 'embedding',
    description: 'Vector embedding of content chunk',
    data_type: DataType.FloatVector,
    dim: EMBEDDING_DIMENSION,
  },
  {
    name: 'url',
    description: 'Source URL of the crawled page',
    data_type: DataType.VarChar,
    max_length: 2048,
  },
  {
    name: 'title',
    description: 'Page title',
    data_type: DataType.VarChar,
    max_length: 512,
  },
  {
    name: 'content',
    description: 'Text content chunk',
    data_type: DataType.VarChar,
    max_length: 10000,
  },
  {
    name: 'crawled_at',
    description: 'Timestamp when page was crawled',
    data_type: DataType.Int64,
  },
  {
    name: 'summary',
    description: 'AI-generated summary of the page',
    data_type: DataType.VarChar,
    max_length: 2000,
  },
];

// Helper function to ensure we're using the correct database
async function ensureDatabaseContext() {
  try {
    await client.use({ db_name: DATABASE_NAME });
  } catch (error) {
    console.error('Error switching to database:', error);
    throw error;
  }
}

// Initialize database - create database, collection and index if they don't exist
export async function initializeDatabase() {
  try {
    // Check if database exists and create if needed
    try {
      const databases = await client.listDatabases();
      const dbExists = (databases.db_names as string[])?.includes(DATABASE_NAME) || false;
      
      if (!dbExists) {
        console.log(`Creating Milvus database: ${DATABASE_NAME}`);
        await client.createDatabase({ db_name: DATABASE_NAME });
        console.log(`Database ${DATABASE_NAME} created successfully`);
      } else {
        console.log(`Using existing database: ${DATABASE_NAME}`);
      }
    } catch (error: any) {
      // If listDatabases fails, try to create the database anyway
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        console.log(`Creating Milvus database: ${DATABASE_NAME}`);
        await client.createDatabase({ db_name: DATABASE_NAME });
        console.log(`Database ${DATABASE_NAME} created successfully`);
      } else {
        throw error;
      }
    }

    // Switch to the database
    await client.use({ db_name: DATABASE_NAME });
    console.log(`Switched to database: ${DATABASE_NAME}`);

    // Check if collection exists
    const collections = await client.showCollections();
    const collectionNames = (collections.data as any)?.map((col: any) => col.name) || [];
    const collectionExists = collectionNames.includes(COLLECTION_NAME);

    if (!collectionExists) {
      console.log(`Creating Milvus collection: ${COLLECTION_NAME}`);
      
      // Create collection with schema
      await client.createCollection({
        collection_name: COLLECTION_NAME,
        fields: collectionSchema,
      });

      console.log(`Collection ${COLLECTION_NAME} created successfully`);

      // Create HNSW index on embedding field
      console.log('Creating HNSW index on embedding field...');
      await client.createIndex({
        collection_name: COLLECTION_NAME,
        field_name: 'embedding',
        index_name: 'hnsw_index',
        index_type: IndexType.HNSW,
        metric_type: MetricType.L2,
        params: {
          M: 64,
          efConstruction: 200,
        },
      });

      console.log('HNSW index created successfully');

      // Load collection into memory for search operations
      await client.loadCollectionSync({ collection_name: COLLECTION_NAME });
      console.log('Collection loaded into memory');
    } else {
      console.log(`Using existing collection: ${COLLECTION_NAME}`);
      
      // Ensure collection is loaded - check using showCollections
      const collectionStatus = await client.showCollections({ collection_names: [COLLECTION_NAME] });
      const isLoaded = (collectionStatus.data as any)?.[0]?.loaded || false;
      if (!isLoaded) {
        await client.loadCollectionSync({ collection_name: COLLECTION_NAME });
        console.log('Collection loaded into memory');
      }
    }

    console.log('Milvus database initialized successfully');
    return { success: true, databaseName: DATABASE_NAME, collectionName: COLLECTION_NAME };
  } catch (error) {
    console.error('Error initializing Milvus database:', error);
    throw error;
  }
}

// Store website chunks in Milvus
export async function storeWebsiteChunks(
  url: string,
  title: string,
  description: string,
  contentChunks: Array<{ content: string; embedding: number[]; metadata?: any }>
) {
  try {
    // Ensure we're using the correct database
    await ensureDatabaseContext();
    
    // Generate unique IDs for each chunk (timestamp-based)
    const baseTimestamp = Date.now();
    const ids = contentChunks.map((_, index) => baseTimestamp + index);
    
    // Prepare data for insertion
    const entities = contentChunks.map((chunk, index) => ({
      id: ids[index],
      embedding: chunk.embedding,
      url: url,
      title: title || 'Untitled',
      content: chunk.content,
      crawled_at: baseTimestamp,
      summary: description || chunk.metadata?.summary || null,
    }));

    // Insert data in batches (Milvus recommends batches of 100-1000)
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      
      await client.insert({
        collection_name: COLLECTION_NAME,
        fields_data: batch,
      });
      
      insertedCount += batch.length;
      console.log(`Inserted batch: ${insertedCount}/${entities.length} chunks`);
    }

    // Flush to ensure data is written
    await client.flush({ collection_names: [COLLECTION_NAME] });

    console.log(`Successfully stored ${insertedCount} chunks for website: ${url}`);
    return { success: true, chunksStored: insertedCount };
  } catch (error) {
    console.error('Error storing website chunks in Milvus:', error);
    throw error;
  }
}

// Search for similar content using vector similarity
export async function searchSimilarContent(
  queryEmbedding: number[],
  limit: number = 5,
  similarityThreshold: number = 0.5,
  filters?: { url?: string; title?: string }
) {
  try {
    // Ensure we're using the correct database
    await ensureDatabaseContext();
    
    // Validate query embedding
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Invalid query embedding: must be an array of ${EMBEDDING_DIMENSION} numbers`);
    }

    console.log(`Searching with embedding dimension: ${queryEmbedding.length}`);

    // Build filter expression if filters are provided
    let expr: string | undefined;
    if (filters) {
      const filterParts: string[] = [];
      if (filters.url) {
        filterParts.push(`url == "${filters.url}"`);
      }
      if (filters.title) {
        filterParts.push(`title == "${filters.title}"`);
      }
      if (filterParts.length > 0) {
        expr = filterParts.join(' && ');
      }
    }

    // Perform vector search
    const searchParams = {
      collection_name: COLLECTION_NAME,
      data: [queryEmbedding],
      limit: limit,
      params: { ef: 100 }, // HNSW search parameter
      output_fields: ['id', 'url', 'title', 'content', 'crawled_at', 'summary'],
      expr: expr, // Optional filter expression
    };

    const results = await client.search(searchParams);

    // Handle different possible result structures
    let resultsArray: any[] = [];
    
    if (results.results) {
      // Check if results.results is an array of arrays or array of objects
      if (Array.isArray(results.results) && results.results.length > 0) {
        // If first element is an array, use it directly (multiple query vectors)
        if (Array.isArray(results.results[0])) {
          resultsArray = results.results[0];
        } 
        // If first element is an object (single query result), use the results array directly
        else if (typeof results.results[0] === 'object') {
          resultsArray = results.results;
        }
      }
    }

    if (resultsArray.length === 0) {
      console.log('No documents found in Milvus query');
      return [];
    }

    console.log(`Processing ${resultsArray.length} search results`);

    // Process results
    const allResults = resultsArray.map((result: any, index: number) => {
      // Handle different result structures
      const distance = result.distance || result.score || 1;
      const similarity = 1 - distance; // Convert L2 distance to similarity (normalized)

      // Try different possible field access patterns
      const entity = result.entity || result.output_fields || result;
      const id = result.id || entity?.id;
      const content = entity?.content || result.content || '';
      const url = entity?.url || result.url || '';
      const title = entity?.title || result.title || '';
      const crawled_at = entity?.crawled_at || result.crawled_at || null;
      const summary = entity?.summary || result.summary || null;

      return {
        content: content,
        metadata: {
          id: id,
          url: url,
          title: title,
          crawled_at: crawled_at,
          summary: summary,
        },
        url: url,
        title: title,
        similarity: similarity,
        distance: distance,
      };
    });

    console.log(`Found ${allResults.length} total results`);
    allResults.forEach((result: any, idx: number) => {
      console.log(`  Result ${idx + 1}: similarity=${result.similarity.toFixed(3)}, distance=${result.distance.toFixed(3)}, url=${result.url}`);
    });

    // Filter by threshold
    let filteredResults = allResults.filter((item: any) => item.similarity >= similarityThreshold);

    console.log(`After filtering (threshold: ${similarityThreshold}): ${filteredResults.length} results`);

    // If no results after filtering, return top results anyway
    if (filteredResults.length === 0 && allResults.length > 0) {
      console.log(`No results passed threshold ${similarityThreshold}, but returning top ${Math.min(3, allResults.length)} results anyway`);
      filteredResults = allResults.slice(0, Math.min(3, allResults.length));
    }

    return filteredResults.map((r: any) => ({
      content: r.content,
      metadata: r.metadata,
      url: r.url,
      title: r.title,
      similarity: r.similarity,
    }));
  } catch (error) {
    console.error('Error searching similar content in Milvus:', error);
    throw error;
  }
}

// Get all unique websites from the collection
export async function getAllWebsites() {
  try {
    // Ensure we're using the correct database
    await ensureDatabaseContext();
    
    // Query all documents to extract unique URLs
    const results = await client.query({
      collection_name: COLLECTION_NAME,
      expr: '', // Empty expression to get all
      output_fields: ['url', 'title', 'crawled_at'],
      limit: 10000, // Adjust based on expected number of chunks
    });

    // Group by URL to get unique websites
    const websites = new Map<string, { url: string; title: string; crawled_at: number }>();
    
    if (results.data && results.data.length > 0) {
      results.data.forEach((item: any) => {
        if (item.url && !websites.has(item.url)) {
          websites.set(item.url, {
            url: item.url,
            title: item.title || 'Untitled',
            crawled_at: item.crawled_at || 0,
          });
        }
      });
    }

    return Array.from(websites.values());
  } catch (error) {
    console.error('Error getting websites from Milvus:', error);
    throw error;
  }
}

// Delete all chunks for a specific URL
export async function deleteWebsiteData(url: string) {
  try {
    // Ensure we're using the correct database
    await ensureDatabaseContext();
    
    // Delete using filter expression
    const deleteResult = await client.delete({
      collection_name: COLLECTION_NAME,
      filter: `url == "${url}"`,
    } as any); // Type assertion for filter parameter

    // Flush to ensure deletion is persisted
    await client.flush({ collection_names: [COLLECTION_NAME] });

    const deletedCount = (deleteResult as any).delete_cnt || 0;
    console.log(`Deleted ${deletedCount} chunks for website: ${url}`);
    
    return { success: true, deletedChunks: deletedCount };
  } catch (error) {
    console.error('Error deleting website data from Milvus:', error);
    throw error;
  }
}

// Check if collection has data
export async function checkCollectionData() {
  try {
    // Ensure we're using the correct database
    await ensureDatabaseContext();
    
    // Ensure collection is loaded
    try {
      const collectionStatus = await client.showCollections({ 
        collection_names: [COLLECTION_NAME] 
      });
      const isLoaded = (collectionStatus.data as any)?.[0]?.loaded || false;
      if (!isLoaded) {
        console.log('Collection not loaded, loading now...');
        await client.loadCollectionSync({ collection_name: COLLECTION_NAME });
        console.log('Collection loaded successfully');
      }
    } catch (loadError) {
      console.warn('Warning: Could not check/load collection:', loadError);
      // Continue anyway - query might still work
    }
    
    // Try to query for a single document - more reliable than statistics
    const sample = await client.query({
      collection_name: COLLECTION_NAME,
      expr: '',
      output_fields: ['id', 'url', 'title'],
      limit: 1,
    });
    
    const hasData = sample.data && sample.data.length > 0;
    
    // If we have data, try to get actual count using statistics
    let count = 0;
    if (hasData) {
      try {
        const stats = await client.getCollectionStatistics({ 
          collection_name: COLLECTION_NAME 
        });
        // Try multiple possible response structures
        count = (stats as any).stats?.row_count 
             || (stats as any).row_count 
             || (stats as any).data?.row_count
             || sample.data.length;
        console.log(`Collection has ${count} documents`);
      } catch (statsError) {
        console.warn('Could not get row count from statistics, using sample data:', statsError);
        count = hasData ? 1 : 0; // At least 1 if we found data
      }
    } else {
      console.log('No data found in collection');
    }
    
    return {
      hasData,
      count,
      sample: hasData ? sample.data[0] : null,
    };
  } catch (error) {
    console.error('Error checking collection data:', error);
    // Log full error details for debugging
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });
    }
    return { 
      hasData: false, 
      count: 0, 
      error: error instanceof Error ? error.message : 'Unknown error',
      sample: null,
    };
  }
}

// Export Milvus client for direct access if needed
export { client };

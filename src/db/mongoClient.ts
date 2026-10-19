import { MongoClient, Db, Collection } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

export interface MongoConfig {
  uri: string;
  dbName: string;
  collectionName: string;
}

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export function getMongoConfig(): MongoConfig {
  return {
    uri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/myDatabase",
    dbName: process.env.MONGODB_DB_NAME || "myDatabase",
    collectionName: process.env.MONGODB_COLLECTION || "ResidentialAPI",
  };
}

/**
 * Connects to MongoDB with connection reuse and index initialization
 */
export async function connectMongo(): Promise<Db> {
  if (dbInstance && client) {
    return dbInstance;
  }

  const { uri, dbName, collectionName } = getMongoConfig();

  try {
    client = new MongoClient(uri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    dbInstance = client.db(dbName);
    console.log(`✅ [MongoDB] Connected successfully to database: "${dbName}"`);

    // Ensure Indexes on the ResidentialAPI collection
    const collection = dbInstance.collection(collectionName);
    await collection.createIndex({ stationId: 1, date: 1 }, { unique: true });
    await collection.createIndex({ stationId: 1, updatedAt: -1 });

    return dbInstance;
  } catch (error: any) {
    console.error(`❌ [MongoDB] Connection error to "${dbName}":`, error.message);
    throw error;
  }
}

/**
 * Returns the ResidentialAPI collection reference
 */
export async function getResidentialCollection(): Promise<Collection> {
  const db = await connectMongo();
  const { collectionName } = getMongoConfig();
  return db.collection(collectionName);
}

/**
 * Gracefully close MongoDB client
 */
export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    dbInstance = null;
    console.log("🔌 [MongoDB] Connection closed.");
  }
}

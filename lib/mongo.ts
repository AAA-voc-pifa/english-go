import { MongoClient, type Db } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { env } from "@/lib/env"

const globalForMongo = globalThis as unknown as {
  mongoClient?: MongoClient
  mongoUri?: string
}

export async function getDb(): Promise<Db> {
  const { mongodbUri, mongodbDb } = env()
  if (!globalForMongo.mongoClient || globalForMongo.mongoUri !== mongodbUri) {
    const client = new MongoClient(mongodbUri, { serverSelectionTimeoutMS: 3000 })
    try {
      await client.connect()
    } catch (error) {
      console.error("mongodb connect failed", error instanceof Error ? error.name : "error")
      throw new ApiError("Can't reach MongoDB. Start the database first.", 503)
    }
    globalForMongo.mongoClient = client
    globalForMongo.mongoUri = mongodbUri
  }
  return globalForMongo.mongoClient.db(mongodbDb)
}

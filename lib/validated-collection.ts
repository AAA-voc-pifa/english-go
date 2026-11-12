import {
  ObjectId,
  type Collection,
  type DeleteResult,
  type Document,
  type Filter,
  type FindOptions,
  type InsertOneResult,
  type UpdateFilter,
  type UpdateOptions,
  type UpdateResult,
} from "mongodb"
import type { z } from "zod"
import { ApiError } from "@/lib/api-error"
import { parseDoc, parseDocs } from "@/lib/db-schema"

export type DocCollection<T extends Document> = {
  findOne(filter: Filter<T>, options?: FindOptions): Promise<T | null>
  findMany(filter?: Filter<T>, options?: FindOptions): Promise<T[]>
  insertOne(doc: T): Promise<InsertOneResult>
  updateOne(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<UpdateResult>
  deleteOne(filter: Filter<T>): Promise<DeleteResult>
  /** Unvalidated driver access — migrations only. */
  raw: Collection<T>
}

function docLabel(name: string, doc: { _id?: unknown }): string {
  if (doc._id instanceof ObjectId) return `${name} ${doc._id.toHexString()}`
  return name
}

export function validatedCollection<T extends Document>(
  coll: Collection<T>,
  schema: z.ZodType<T>,
  name: string,
): DocCollection<T> {
  function rejectProjection(options?: FindOptions) {
    if (options?.projection) {
      throw new ApiError(`Internal: ${name} reads must be full documents for schema checks`, 500)
    }
  }

  async function revalidateAfterUpdate(filter: Filter<T>, result: UpdateResult) {
    if (result.matchedCount === 0 && result.upsertedCount === 0) return
    const id =
      result.upsertedId !== null && result.upsertedId !== undefined
        ? result.upsertedId
        : (filter as { _id?: unknown })._id
    if (id === undefined || id === null) return
    const doc = await coll.findOne({ _id: id } as Filter<T>)
    if (!doc) return
    const label =
      id instanceof ObjectId ? `${name} ${id.toHexString()}` : `${name} ${String(id)}`
    parseDoc(schema, doc, label)
  }

  return {
    raw: coll,
    async findOne(filter, options) {
      rejectProjection(options)
      const doc = await coll.findOne(filter, options)
      if (!doc) return null
      return parseDoc(schema, doc, docLabel(name, doc))
    },
    async findMany(filter = {}, options) {
      rejectProjection(options)
      const docs = await coll.find(filter, options).toArray()
      return parseDocs(schema, docs, name)
    },
    async insertOne(doc) {
      const parsed = parseDoc(schema, doc, name)
      return coll.insertOne(parsed as Parameters<Collection<T>["insertOne"]>[0])
    },
    async updateOne(filter, update, options) {
      const result = await coll.updateOne(filter, update, options)
      await revalidateAfterUpdate(filter, result)
      return result
    },
    async deleteOne(filter) {
      return coll.deleteOne(filter)
    },
  }
}

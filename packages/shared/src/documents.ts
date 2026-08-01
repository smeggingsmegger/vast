import { z } from 'zod';

export const FindBodySchema = z.object({
  filter: z.unknown().optional(),
  projection: z.record(z.union([z.literal(0), z.literal(1)])).optional(),
  sort: z.record(z.union([z.literal(1), z.literal(-1)])).optional(),
  skip: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  maxTimeMS: z.number().int().min(1).max(300_000).optional(),
});

export const InsertOneBodySchema = z.object({
  document: z.unknown(),
});

export const InsertManyBodySchema = z.object({
  documents: z.array(z.unknown()).min(1).max(5000),
});

export const ReplaceBodySchema = z.object({
  document: z.unknown(),
});

export const PatchBodySchema = z.object({
  set: z.record(z.unknown()).optional(),
  unset: z.array(z.string()).optional(),
  rename: z.record(z.string()).optional(),
  inc: z.record(z.number()).optional(),
});

export const ConvertFieldBodySchema = z.object({
  path: z.string().min(1),
  toType: z.enum(['string', 'int', 'long', 'double', 'decimal', 'bool', 'date', 'objectId', 'null']),
});

export const FieldEditTypeSchema = z.enum([
  'string',
  'int',
  'long',
  'double',
  'decimal',
  'bool',
  'date',
  'objectId',
  'null',
  'json',
]);

/** Single-field update from type-aware editor. */
export const SetFieldBodySchema = z.object({
  path: z.string().min(1),
  type: FieldEditTypeSchema,
  /** Raw editor value (string/boolean/null/json string). */
  value: z.unknown(),
});

export const AggregateBodySchema = z.object({
  pipeline: z.array(z.unknown()),
  allowDiskUse: z.boolean().optional(),
  maxTimeMS: z.number().int().optional(),
  limit: z.number().int().min(1).max(10_000).optional(),
});

export const CreateIndexBodySchema = z.object({
  keys: z.record(z.union([z.number(), z.string()])),
  name: z.string().optional(),
  unique: z.boolean().optional(),
  sparse: z.boolean().optional(),
  expireAfterSeconds: z.number().int().optional(),
});

export const CreateCollectionBodySchema = z.object({
  name: z.string().min(1),
  capped: z.boolean().optional(),
  size: z.number().int().optional(),
  max: z.number().int().optional(),
});

export const CreateDatabaseBodySchema = z.object({
  name: z.string().min(1).max(64),
});

export const DropConfirmSchema = z.object({
  confirmName: z.string().min(1),
});

export const ImportBodySchema = z.object({
  format: z.enum(['json', 'jsonl']),
  content: z.string().min(1),
});

export const ExportBodySchema = z.object({
  format: z.enum(['json', 'jsonl', 'csv']),
  filter: z.unknown().optional(),
  limit: z.number().int().min(1).max(100_000).optional(),
});

export const DumpBodySchema = z.object({
  database: z.string().min(1),
  collections: z.array(z.string()).optional(),
});

export const RestoreBodySchema = z.object({
  targetDatabase: z.string().min(1),
  dumpDir: z.string().min(1),
  drop: z.boolean().optional(),
});

export const LoginBodySchema = z.object({
  password: z.string().min(1),
});

export const SchemaAnalyzeBodySchema = z.object({
  sampleSize: z.number().int().min(1).max(10_000).optional(),
});

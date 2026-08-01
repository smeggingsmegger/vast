import { z } from 'zod';
export declare const FindBodySchema: z.ZodObject<{
    filter: z.ZodOptional<z.ZodUnknown>;
    projection: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodLiteral<0>, z.ZodLiteral<1>]>>>;
    sort: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodLiteral<1>, z.ZodLiteral<-1>]>>>;
    skip: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
    maxTimeMS: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    sort?: Record<string, 1 | -1> | undefined;
    filter?: unknown;
    limit?: number | undefined;
    skip?: number | undefined;
    projection?: Record<string, 0 | 1> | undefined;
    maxTimeMS?: number | undefined;
}, {
    sort?: Record<string, 1 | -1> | undefined;
    filter?: unknown;
    limit?: number | undefined;
    skip?: number | undefined;
    projection?: Record<string, 0 | 1> | undefined;
    maxTimeMS?: number | undefined;
}>;
export declare const InsertOneBodySchema: z.ZodObject<{
    document: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    document?: unknown;
}, {
    document?: unknown;
}>;
export declare const InsertManyBodySchema: z.ZodObject<{
    documents: z.ZodArray<z.ZodUnknown, "many">;
}, "strip", z.ZodTypeAny, {
    documents: unknown[];
}, {
    documents: unknown[];
}>;
export declare const ReplaceBodySchema: z.ZodObject<{
    document: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    document?: unknown;
}, {
    document?: unknown;
}>;
export declare const PatchBodySchema: z.ZodObject<{
    set: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    unset: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    rename: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    inc: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    set?: Record<string, unknown> | undefined;
    unset?: string[] | undefined;
    rename?: Record<string, string> | undefined;
    inc?: Record<string, number> | undefined;
}, {
    set?: Record<string, unknown> | undefined;
    unset?: string[] | undefined;
    rename?: Record<string, string> | undefined;
    inc?: Record<string, number> | undefined;
}>;
export declare const ConvertFieldBodySchema: z.ZodObject<{
    path: z.ZodString;
    toType: z.ZodEnum<["string", "int", "long", "double", "decimal", "bool", "date", "objectId", "null"]>;
}, "strip", z.ZodTypeAny, {
    path: string;
    toType: "string" | "date" | "null" | "int" | "long" | "double" | "decimal" | "bool" | "objectId";
}, {
    path: string;
    toType: "string" | "date" | "null" | "int" | "long" | "double" | "decimal" | "bool" | "objectId";
}>;
export declare const AggregateBodySchema: z.ZodObject<{
    pipeline: z.ZodArray<z.ZodUnknown, "many">;
    allowDiskUse: z.ZodOptional<z.ZodBoolean>;
    maxTimeMS: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    pipeline: unknown[];
    limit?: number | undefined;
    maxTimeMS?: number | undefined;
    allowDiskUse?: boolean | undefined;
}, {
    pipeline: unknown[];
    limit?: number | undefined;
    maxTimeMS?: number | undefined;
    allowDiskUse?: boolean | undefined;
}>;
export declare const CreateIndexBodySchema: z.ZodObject<{
    keys: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodNumber, z.ZodString]>>;
    name: z.ZodOptional<z.ZodString>;
    unique: z.ZodOptional<z.ZodBoolean>;
    sparse: z.ZodOptional<z.ZodBoolean>;
    expireAfterSeconds: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    keys: Record<string, string | number>;
    name?: string | undefined;
    unique?: boolean | undefined;
    sparse?: boolean | undefined;
    expireAfterSeconds?: number | undefined;
}, {
    keys: Record<string, string | number>;
    name?: string | undefined;
    unique?: boolean | undefined;
    sparse?: boolean | undefined;
    expireAfterSeconds?: number | undefined;
}>;
export declare const CreateCollectionBodySchema: z.ZodObject<{
    name: z.ZodString;
    capped: z.ZodOptional<z.ZodBoolean>;
    size: z.ZodOptional<z.ZodNumber>;
    max: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    capped?: boolean | undefined;
    size?: number | undefined;
    max?: number | undefined;
}, {
    name: string;
    capped?: boolean | undefined;
    size?: number | undefined;
    max?: number | undefined;
}>;
export declare const CreateDatabaseBodySchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const DropConfirmSchema: z.ZodObject<{
    confirmName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    confirmName: string;
}, {
    confirmName: string;
}>;
export declare const ImportBodySchema: z.ZodObject<{
    format: z.ZodEnum<["json", "jsonl"]>;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    format: "json" | "jsonl";
    content: string;
}, {
    format: "json" | "jsonl";
    content: string;
}>;
export declare const ExportBodySchema: z.ZodObject<{
    format: z.ZodEnum<["json", "jsonl", "csv"]>;
    filter: z.ZodOptional<z.ZodUnknown>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    format: "json" | "jsonl" | "csv";
    filter?: unknown;
    limit?: number | undefined;
}, {
    format: "json" | "jsonl" | "csv";
    filter?: unknown;
    limit?: number | undefined;
}>;
export declare const DumpBodySchema: z.ZodObject<{
    database: z.ZodString;
    collections: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    database: string;
    collections?: string[] | undefined;
}, {
    database: string;
    collections?: string[] | undefined;
}>;
export declare const RestoreBodySchema: z.ZodObject<{
    targetDatabase: z.ZodString;
    dumpDir: z.ZodString;
    drop: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    targetDatabase: string;
    dumpDir: string;
    drop?: boolean | undefined;
}, {
    targetDatabase: string;
    dumpDir: string;
    drop?: boolean | undefined;
}>;
export declare const LoginBodySchema: z.ZodObject<{
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
}, {
    password: string;
}>;
export declare const SchemaAnalyzeBodySchema: z.ZodObject<{
    sampleSize: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    sampleSize?: number | undefined;
}, {
    sampleSize?: number | undefined;
}>;
//# sourceMappingURL=documents.d.ts.map
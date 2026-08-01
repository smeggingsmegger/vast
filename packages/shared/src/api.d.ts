import { z } from 'zod';
export declare const PageMetaSchema: z.ZodObject<{
    limit: z.ZodNumber;
    skip: z.ZodNumber;
    returned: z.ZodNumber;
    hasMore: z.ZodOptional<z.ZodBoolean>;
    executionMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    skip: number;
    returned: number;
    hasMore?: boolean | undefined;
    executionMs?: number | undefined;
}, {
    limit: number;
    skip: number;
    returned: number;
    hasMore?: boolean | undefined;
    executionMs?: number | undefined;
}>;
export type PageMeta = z.infer<typeof PageMetaSchema>;
export declare function paginatedSchema<T extends z.ZodTypeAny>(item: T): z.ZodObject<{
    data: z.ZodArray<T, "many">;
    page: z.ZodObject<{
        limit: z.ZodNumber;
        skip: z.ZodNumber;
        returned: z.ZodNumber;
        hasMore: z.ZodOptional<z.ZodBoolean>;
        executionMs: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        skip: number;
        returned: number;
        hasMore?: boolean | undefined;
        executionMs?: number | undefined;
    }, {
        limit: number;
        skip: number;
        returned: number;
        hasMore?: boolean | undefined;
        executionMs?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    data: T["_output"][];
    page: {
        limit: number;
        skip: number;
        returned: number;
        hasMore?: boolean | undefined;
        executionMs?: number | undefined;
    };
}, {
    data: T["_input"][];
    page: {
        limit: number;
        skip: number;
        returned: number;
        hasMore?: boolean | undefined;
        executionMs?: number | undefined;
    };
}>;
//# sourceMappingURL=api.d.ts.map
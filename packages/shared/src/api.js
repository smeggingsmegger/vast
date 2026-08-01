import { z } from 'zod';
export const PageMetaSchema = z.object({
    limit: z.number().int().nonnegative(),
    skip: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    hasMore: z.boolean().optional(),
    executionMs: z.number().nonnegative().optional(),
});
export function paginatedSchema(item) {
    return z.object({
        data: z.array(item),
        page: PageMetaSchema,
    });
}
//# sourceMappingURL=api.js.map
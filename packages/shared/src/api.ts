import { z } from 'zod';

export const PageMetaSchema = z.object({
  limit: z.number().int().nonnegative(),
  skip: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  hasMore: z.boolean().optional(),
  executionMs: z.number().nonnegative().optional(),
});

export type PageMeta = z.infer<typeof PageMetaSchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    page: PageMetaSchema,
  });
}

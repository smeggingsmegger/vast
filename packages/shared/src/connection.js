import { z } from 'zod';
export const ConnectionColorSchema = z.enum([
    'slate',
    'red',
    'orange',
    'amber',
    'emerald',
    'teal',
    'cyan',
    'blue',
    'indigo',
    'violet',
    'pink',
]);
export const CreateConnectionSchema = z.object({
    name: z.string().min(1).max(120),
    uri: z.string().min(1).max(4000),
    color: ConnectionColorSchema.default('teal'),
    notes: z.string().max(2000).optional(),
    readOnly: z.boolean().default(false),
    defaultDatabase: z.string().max(120).optional(),
});
export const UpdateConnectionSchema = CreateConnectionSchema.partial().extend({
    name: z.string().min(1).max(120).optional(),
    uri: z.string().min(1).max(4000).optional(),
});
export const ConnectionPublicSchema = z.object({
    id: z.string(),
    name: z.string(),
    color: ConnectionColorSchema,
    notes: z.string().optional(),
    readOnly: z.boolean(),
    defaultDatabase: z.string().optional(),
    /** Redacted URI for display (password masked). */
    uriDisplay: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastUsedAt: z.string().optional(),
    status: z.enum(['disconnected', 'connected', 'error']),
    lastError: z.string().optional(),
});
export const TestConnectionSchema = z.object({
    uri: z.string().min(1).max(4000),
});
export const TestConnectionResultSchema = z.object({
    ok: z.boolean(),
    message: z.string(),
    serverVersion: z.string().optional(),
    host: z.string().optional(),
});
//# sourceMappingURL=connection.js.map
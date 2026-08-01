import { z } from 'zod';
export const VastRuntimeSchema = z.enum(['web', 'desktop', 'dev']);
export const AuthModeSchema = z.enum(['none', 'password', 'oidc']);
export const MetaResponseSchema = z.object({
    name: z.literal('vast'),
    version: z.string(),
    runtime: VastRuntimeSchema,
    authMode: AuthModeSchema,
    features: z.object({
        dumpTools: z.boolean(),
        oidc: z.boolean(),
    }),
});
export const HealthResponseSchema = z.object({
    status: z.literal('ok'),
    uptimeSec: z.number(),
});
//# sourceMappingURL=runtime.js.map
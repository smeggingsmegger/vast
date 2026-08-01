import { z } from 'zod';

export const VastRuntimeSchema = z.enum(['web', 'desktop', 'dev']);
export type VastRuntime = z.infer<typeof VastRuntimeSchema>;

export const AuthModeSchema = z.enum(['none', 'password', 'oidc']);
export type AuthMode = z.infer<typeof AuthModeSchema>;

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

export type MetaResponse = z.infer<typeof MetaResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSec: z.number(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

import { z } from 'zod';
export declare const VastRuntimeSchema: z.ZodEnum<["web", "desktop", "dev"]>;
export type VastRuntime = z.infer<typeof VastRuntimeSchema>;
export declare const AuthModeSchema: z.ZodEnum<["none", "password", "oidc"]>;
export type AuthMode = z.infer<typeof AuthModeSchema>;
export declare const MetaResponseSchema: z.ZodObject<{
    name: z.ZodLiteral<"vast">;
    version: z.ZodString;
    runtime: z.ZodEnum<["web", "desktop", "dev"]>;
    authMode: z.ZodEnum<["none", "password", "oidc"]>;
    features: z.ZodObject<{
        dumpTools: z.ZodBoolean;
        oidc: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        oidc: boolean;
        dumpTools: boolean;
    }, {
        oidc: boolean;
        dumpTools: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    name: "vast";
    version: string;
    runtime: "web" | "desktop" | "dev";
    authMode: "none" | "password" | "oidc";
    features: {
        oidc: boolean;
        dumpTools: boolean;
    };
}, {
    name: "vast";
    version: string;
    runtime: "web" | "desktop" | "dev";
    authMode: "none" | "password" | "oidc";
    features: {
        oidc: boolean;
        dumpTools: boolean;
    };
}>;
export type MetaResponse = z.infer<typeof MetaResponseSchema>;
export declare const HealthResponseSchema: z.ZodObject<{
    status: z.ZodLiteral<"ok">;
    uptimeSec: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    status: "ok";
    uptimeSec: number;
}, {
    status: "ok";
    uptimeSec: number;
}>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
//# sourceMappingURL=runtime.d.ts.map
import { z } from 'zod';
export declare const ConnectionColorSchema: z.ZodEnum<["slate", "red", "orange", "amber", "emerald", "teal", "cyan", "blue", "indigo", "violet", "pink"]>;
export type ConnectionColor = z.infer<typeof ConnectionColorSchema>;
export declare const CreateConnectionSchema: z.ZodObject<{
    name: z.ZodString;
    uri: z.ZodString;
    color: z.ZodDefault<z.ZodEnum<["slate", "red", "orange", "amber", "emerald", "teal", "cyan", "blue", "indigo", "violet", "pink"]>>;
    notes: z.ZodOptional<z.ZodString>;
    readOnly: z.ZodDefault<z.ZodBoolean>;
    defaultDatabase: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    uri: string;
    color: "slate" | "red" | "orange" | "amber" | "emerald" | "teal" | "cyan" | "blue" | "indigo" | "violet" | "pink";
    readOnly: boolean;
    notes?: string | undefined;
    defaultDatabase?: string | undefined;
}, {
    name: string;
    uri: string;
    color?: "slate" | "red" | "orange" | "amber" | "emerald" | "teal" | "cyan" | "blue" | "indigo" | "violet" | "pink" | undefined;
    notes?: string | undefined;
    readOnly?: boolean | undefined;
    defaultDatabase?: string | undefined;
}>;
export type CreateConnectionInput = z.infer<typeof CreateConnectionSchema>;
export declare const UpdateConnectionSchema: z.ZodObject<{
    color: z.ZodOptional<z.ZodDefault<z.ZodEnum<["slate", "red", "orange", "amber", "emerald", "teal", "cyan", "blue", "indigo", "violet", "pink"]>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    readOnly: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    defaultDatabase: z.ZodOptional<z.ZodOptional<z.ZodString>>;
} & {
    name: z.ZodOptional<z.ZodString>;
    uri: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    uri?: string | undefined;
    color?: "slate" | "red" | "orange" | "amber" | "emerald" | "teal" | "cyan" | "blue" | "indigo" | "violet" | "pink" | undefined;
    notes?: string | undefined;
    readOnly?: boolean | undefined;
    defaultDatabase?: string | undefined;
}, {
    name?: string | undefined;
    uri?: string | undefined;
    color?: "slate" | "red" | "orange" | "amber" | "emerald" | "teal" | "cyan" | "blue" | "indigo" | "violet" | "pink" | undefined;
    notes?: string | undefined;
    readOnly?: boolean | undefined;
    defaultDatabase?: string | undefined;
}>;
export type UpdateConnectionInput = z.infer<typeof UpdateConnectionSchema>;
export declare const ConnectionPublicSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    color: z.ZodEnum<["slate", "red", "orange", "amber", "emerald", "teal", "cyan", "blue", "indigo", "violet", "pink"]>;
    notes: z.ZodOptional<z.ZodString>;
    readOnly: z.ZodBoolean;
    defaultDatabase: z.ZodOptional<z.ZodString>;
    /** Redacted URI for display (password masked). */
    uriDisplay: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    lastUsedAt: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["disconnected", "connected", "error"]>;
    lastError: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    status: "disconnected" | "connected" | "error";
    color: "slate" | "red" | "orange" | "amber" | "emerald" | "teal" | "cyan" | "blue" | "indigo" | "violet" | "pink";
    readOnly: boolean;
    id: string;
    uriDisplay: string;
    createdAt: string;
    updatedAt: string;
    notes?: string | undefined;
    defaultDatabase?: string | undefined;
    lastUsedAt?: string | undefined;
    lastError?: string | undefined;
}, {
    name: string;
    status: "disconnected" | "connected" | "error";
    color: "slate" | "red" | "orange" | "amber" | "emerald" | "teal" | "cyan" | "blue" | "indigo" | "violet" | "pink";
    readOnly: boolean;
    id: string;
    uriDisplay: string;
    createdAt: string;
    updatedAt: string;
    notes?: string | undefined;
    defaultDatabase?: string | undefined;
    lastUsedAt?: string | undefined;
    lastError?: string | undefined;
}>;
export type ConnectionPublic = z.infer<typeof ConnectionPublicSchema>;
export declare const TestConnectionSchema: z.ZodObject<{
    uri: z.ZodString;
}, "strip", z.ZodTypeAny, {
    uri: string;
}, {
    uri: string;
}>;
export type TestConnectionInput = z.infer<typeof TestConnectionSchema>;
export declare const TestConnectionResultSchema: z.ZodObject<{
    ok: z.ZodBoolean;
    message: z.ZodString;
    serverVersion: z.ZodOptional<z.ZodString>;
    host: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    ok: boolean;
    serverVersion?: string | undefined;
    host?: string | undefined;
}, {
    message: string;
    ok: boolean;
    serverVersion?: string | undefined;
    host?: string | undefined;
}>;
export type TestConnectionResult = z.infer<typeof TestConnectionResultSchema>;
//# sourceMappingURL=connection.d.ts.map
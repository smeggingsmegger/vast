export declare const ErrorCode: {
    readonly VALIDATION: "VALIDATION";
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly FORBIDDEN: "FORBIDDEN";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly CONFLICT: "CONFLICT";
    readonly QUERY_TIMEOUT: "QUERY_TIMEOUT";
    readonly READ_ONLY: "READ_ONLY";
    readonly CONNECTION_FAILED: "CONNECTION_FAILED";
    readonly MONGO: "MONGO";
    readonly INTERNAL: "INTERNAL";
    readonly JOB_FAILED: "JOB_FAILED";
};
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
export interface VastErrorBody {
    error: {
        code: ErrorCode;
        message: string;
        details?: unknown;
        mongoCode?: number;
    };
}
export declare class VastError extends Error {
    readonly code: ErrorCode;
    readonly status: number;
    readonly details?: unknown;
    readonly mongoCode?: number;
    constructor(code: ErrorCode, message: string, options?: {
        status?: number;
        details?: unknown;
        mongoCode?: number;
        cause?: unknown;
    });
    toJSON(): VastErrorBody;
}
//# sourceMappingURL=errors.d.ts.map
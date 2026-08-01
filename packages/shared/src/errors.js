export const ErrorCode = {
    VALIDATION: 'VALIDATION',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    QUERY_TIMEOUT: 'QUERY_TIMEOUT',
    READ_ONLY: 'READ_ONLY',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    MONGO: 'MONGO',
    INTERNAL: 'INTERNAL',
    JOB_FAILED: 'JOB_FAILED',
};
export class VastError extends Error {
    code;
    status;
    details;
    mongoCode;
    constructor(code, message, options) {
        super(message);
        this.name = 'VastError';
        this.code = code;
        this.status = options?.status ?? defaultStatus(code);
        this.details = options?.details;
        this.mongoCode = options?.mongoCode;
        if (options?.cause !== undefined) {
            // Attach without relying on ErrorOptions (broader TS lib compatibility)
            this.cause = options.cause;
        }
    }
    toJSON() {
        return {
            error: {
                code: this.code,
                message: this.message,
                ...(this.details !== undefined ? { details: this.details } : {}),
                ...(this.mongoCode !== undefined ? { mongoCode: this.mongoCode } : {}),
            },
        };
    }
}
function defaultStatus(code) {
    switch (code) {
        case ErrorCode.VALIDATION:
            return 400;
        case ErrorCode.UNAUTHORIZED:
            return 401;
        case ErrorCode.FORBIDDEN:
        case ErrorCode.READ_ONLY:
            return 403;
        case ErrorCode.NOT_FOUND:
            return 404;
        case ErrorCode.CONFLICT:
            return 409;
        case ErrorCode.QUERY_TIMEOUT:
            return 408;
        case ErrorCode.CONNECTION_FAILED:
            return 502;
        default:
            return 500;
    }
}
//# sourceMappingURL=errors.js.map
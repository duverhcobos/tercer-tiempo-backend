export interface CreateVerificationParams {
    userId: string;
    type: string;
    token: string;
    expiresAt: Date;
}

export interface VerificationRecord {
    id: string;
    userId: string;
    type: string;
    token: string;
    expiresAt: Date;
    usedAt: Date | null;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
}

export interface IVerificationRepository {
    create(params: CreateVerificationParams): Promise<void>;
    findByToken(token: string, type: string): Promise<VerificationRecord | null>;
    markAsUsed(id: string): Promise<void>;
    invalidatePreviousTokens(userId: string, type: string): Promise<void>;
}

export const VERIFICATION_REPOSITORY = Symbol('IVerificationRepository');
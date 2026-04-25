import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtService {
    constructor(private readonly configService: ConfigService) { }

    generateToken(payload: { sub: string; email: string }): string {
        const secret = this.getSecret();
        const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '24h';

        return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
    }

    verifyToken(token: string): any {
        const secret = this.getSecret();
        return jwt.verify(token, secret);
    }

    private getSecret(): string {
        const secret = this.configService.get<string>('JWT_SECRET');
        if (!secret) {
            throw new InternalServerErrorException(
                'JWT_SECRET is not configured in environment variables',
            );
        }
        return secret;
    }
}

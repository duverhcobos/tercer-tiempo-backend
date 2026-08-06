import { Injectable } from '@nestjs/common';

import { JwtService } from '../../infrastructure/services/jwt.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { LoginDto } from '../dtos/login.dto';
import { MeResponseDto } from '../dtos/me-response.dto';
import { RegisterDto } from '../dtos/register.dto';
import { ResendVerificationDto } from '../dtos/resend-verification.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';
import { AuthMapper } from '../mappers/auth.mapper';
import { GetMeUseCase } from '../use-cases/get-me.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { ResendVerificationUseCase } from '../use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
        private readonly verifyEmailUseCase: VerifyEmailUseCase,
        private readonly resendVerificationUseCase: ResendVerificationUseCase,
        private readonly getMeUseCase: GetMeUseCase,
        private readonly jwtService: JwtService,
    ) { }

    async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
        const user = await this.registerUseCase.execute({
            email: registerDto.email,
            username: registerDto.username,
            password: registerDto.password,
            role: registerDto.role,
        });
        const accessToken = this.jwtService.generateToken({ sub: user.id, email: user.email });
        return AuthMapper.toAuthResponse(user, accessToken, true);
    }

    async login(loginDto: LoginDto): Promise<AuthResponseDto> {
        const user = await this.loginUseCase.execute({
            email: loginDto.email,
            password: loginDto.password,
        });
        const accessToken = this.jwtService.generateToken({ sub: user.id, email: user.email });
        return AuthMapper.toAuthResponse(user, accessToken, false);
    }

    async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
        await this.verifyEmailUseCase.execute(dto.token);
        return { message: 'Email verified successfully' };
    }

    async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
        await this.resendVerificationUseCase.execute(dto.email);
        // Siempre responde con el mismo mensaje para no enumerar si el email existe
        return { message: 'If the email exists and is unverified, a new code has been sent' };
    }

    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }
}
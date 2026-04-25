import { Injectable } from '@nestjs/common';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { JwtService } from '../../infrastructure/services/jwt.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { AuthMapper } from '../mappers/auth.mapper';

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
        private readonly jwtService: JwtService,
    ) { }

    async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
        const user = await this.registerUseCase.execute(
            registerDto.email,
            registerDto.password,
            registerDto.phone,
        );

        const accessToken = this.jwtService.generateToken({
            sub: user.id,
            email: user.email,
        });

        return AuthMapper.toAuthResponse(user, accessToken);
    }

    async login(loginDto: LoginDto): Promise<AuthResponseDto> {
        const user = await this.loginUseCase.execute(
            loginDto.email,
            loginDto.password,
        );

        const accessToken = this.jwtService.generateToken({
            sub: user.id,
            email: user.email,
        });

        return AuthMapper.toAuthResponse(user, accessToken);
    }
}

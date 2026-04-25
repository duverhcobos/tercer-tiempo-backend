import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../application/services/auth.service';
import { RegisterDto } from '../../application/dtos/register.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { Public } from '../decorators/public.decorator';
import { ApiRegister, ApiLogin } from '../swagger/auth-controller.swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 intentos por minuto
    @ApiRegister()
    async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
        return this.authService.register(registerDto);
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 intentos por minuto
    @ApiLogin()
    async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
        return this.authService.login(loginDto);
    }
}

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { MeResponseDto } from '../../application/dtos/me-response.dto';
import { RegisterDto } from '../../application/dtos/register.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { AuthService } from '../../application/services/auth.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    // @ApiRegister()
    async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
        return this.authService.register(registerDto);
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    // @ApiLogin()
    async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
        return this.authService.login(loginDto);
    }

    @Public()
    @Post('verify-email')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    // @ApiVerifyEmail()
    async verifyEmail(@Query() dto: VerifyEmailDto): Promise<{ message: string }> {
        return this.authService.verifyEmail(dto);
    }

    @Public()
    @Post('resend-verification')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 3, ttl: 300000 } })
    // @ApiResendVerification()
    async resendVerification(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
        return this.authService.resendVerification(dto);
    }

    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Get('me')
    @HttpCode(HttpStatus.OK)
    // @ApiGetMe()
    async getMe(@CurrentUser() user: { userId: string }): Promise<MeResponseDto> {
        return this.authService.getMe(user.userId);
    }

    // Paso 1: redirige al usuario a la pantalla de consent de Google
    // @Public()
    // @UseGuards(GoogleAuthGuard)
    // @Get('google')
    // googleAuth(): void {
    //     // Passport maneja la redirección automáticamente
    // }

    // Paso 2: Google regresa aquí con el perfil del usuario
    // @Public()
    // @UseGuards(GoogleAuthGuard)
    // @Get('google/callback')
    // async googleCallback(
    //     @Req() req: Request,
    //     @Res() res: Response,
    // ): Promise<void> {
    //     const authResponse = req.user as AuthResponseDto;
    //     res.json(authResponse);
    // }
}

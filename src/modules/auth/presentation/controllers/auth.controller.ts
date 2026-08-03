import { Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards, Req, Res, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../application/services/auth.service';
import { RegisterDto } from '../../application/dtos/register.dto';

import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { Public } from '../decorators/public.decorator';
import { LoginDto } from '../../application/dtos/login.dto';

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
    async verifyEmail(@Query('token') token: string): Promise<{ message: string }> {
        return this.authService.verifyEmail({ token });
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

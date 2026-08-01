import { Injectable } from "@nestjs/common";
import { RegisterUseCase } from "../use-cases/register.use-case";
// import { LoginUseCase } from "../use-cases/login.use-case";
import { JwtService } from "../../infrastructure/services/jwt.service";
import { RegisterDto } from "../dtos/register.dto";
import { AuthResponseDto } from "../dtos/auth-response.dto";
import { AuthMapper } from "../mappers/auth.mapper";

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        // private readonly loginUseCase: LoginUseCase,
        private readonly jwtService: JwtService,
    ) { }

    async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
        const user = await this.registerUseCase.execute({
            email: registerDto.email,
            username: registerDto.username,
            password: registerDto.password,
            role: registerDto.role,
        });

        const accessToken = this.jwtService.generateToken({
            sub: user.id,
            email: user.email,
        })

        return AuthMapper.toAuthResponse(user, accessToken, true);
    }

    //     async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    //     const user = await this.loginUseCase.execute(
    //       loginDto.email,
    //       loginDto.password,
    //     );

    //     const accessToken = this.jwtService.generateToken({
    //       sub: user.id,
    //       email: user.email,
    //     });

    //     return AuthMapper.toAuthResponse(user, accessToken);
    //   }
}
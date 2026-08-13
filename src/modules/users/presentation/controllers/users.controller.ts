import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { UsersService } from "../../application/services/users.service";
import { CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";
import { CreateProfileDto } from "../../application/dtos/create-profile.dto";
import { ProfileResponseDto } from "../../application/dtos/profile-response.dto";

@Controller('users')
export class UsersController {

    constructor(private readonly usersService: UsersService) { }

    // Requiere JWT activo — JwtAuthGuard global (no @Public)
    @Post('profile')
    @HttpCode(HttpStatus.CREATED)
    async createProfile(
        @CurrentUser() user: { userId: string },
        @Body() dto: CreateProfileDto,
    ): Promise<ProfileResponseDto> {
        return this.usersService.createProfile(user.userId, dto);
    }
}

import { User } from '../../domain/entities/user.entity';
import { AuthResponseDto } from '../dtos/auth-response.dto';

export class AuthMapper {
  static toAuthResponse(
    user: User,
    accessToken: string,
    isNewUser = false,
  ): AuthResponseDto {
    return new AuthResponseDto(
      user.id,
      user.email,
      user.username,
      user.role,
      accessToken,
      user.createdAt,
      isNewUser,
    );
  }
}
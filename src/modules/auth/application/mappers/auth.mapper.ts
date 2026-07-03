import { User } from '../../domain/entities/user.entity';
import { AuthResponseDto } from '../dtos/auth-response.dto';

export class AuthMapper {
    /**
     * Convierte una entidad de dominio User a AuthResponseDto
     * @param user - Entidad de dominio
     * @param accessToken - Token JWT generado
     */
    static toAuthResponse(user: User, accessToken: string, isNewUser = false): AuthResponseDto {
        return new AuthResponseDto(
            user.id,
            user.email,
            accessToken,
            user.createdAt,
            isNewUser,
        );
    }

    /**
     * Convierte una entidad de dominio User a un objeto simple (sin contraseña)
     * Útil para respuestas que no requieren token
     */
    static toUserResponse(user: User): {
        id: string;
        email: string;
        createdAt: Date;
        updatedAt: Date;
    } {
        return {
            id: user.id,
            email: user.email,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }
}

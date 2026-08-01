import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../domain/enums/user-role.enum';

export class RegisterSchema {
  @ApiProperty({
    description: 'Email único del usuario',
    example: 'jugador@ejemplo.com',
    format: 'email',
  })
  email!: string;

  @ApiProperty({
    description: 'Nombre de usuario único (letras, números y guion bajo)',
    example: 'duver_10',
    minLength: 3,
    maxLength: 50,
  })
  username!: string;

  @ApiProperty({
    description: 'Contraseña (mínimo 8 caracteres)',
    example: 'Password123',
    minLength: 8,
  })
  password!: string;

  @ApiProperty({
    description: 'Rol con el que el usuario se registra',
    enum: UserRole,
    example: UserRole.PLAYER,
  })
  role!: UserRole;
}
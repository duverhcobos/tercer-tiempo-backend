import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { UserProfileSchema } from '../../infrastructure/database/schemas/user-profile.schema';
import { UserProfileRepository } from './infrastructure/repositories/user-profile.repository';
import { CreateProfileUseCase } from './application/use-cases/create-profile.use-case';
import { UsersService } from './application/services/users.service';
import { UsersController } from './presentation/controllers/users.controller';
import { USER_PROFILE_REPOSITORY } from './domain/repositories/user-profile.repository.interface';

@Module({
    imports: [TypeOrmModule.forFeature([UserProfileSchema]), AuthModule],
    controllers: [UsersController],
    providers: [
        { provide: USER_PROFILE_REPOSITORY, useClass: UserProfileRepository },
        CreateProfileUseCase,
        UsersService,
    ],
})
export class UsersModule {}
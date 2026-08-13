import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { plainToClass } from 'class-transformer';
import { validateSync } from 'class-validator';

import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { LoggerModule } from './common/logger/logger.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import emailConfig from './config/email.config';
import { EnvironmentVariables } from './config/env.validation';
import jwtConfig from './config/jwt.config';
import loggerConfig from './config/logger.config';
import throttleConfig from './config/throttle.config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './infrastructure/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/presentation/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [databaseConfig, jwtConfig, appConfig, throttleConfig, loggerConfig, emailConfig],
      validate: (config: Record<string, unknown>) => {
        const validatedConfig = plainToClass(EnvironmentVariables, config, {
          enableImplicitConversion: true,
        });
        const errors = validateSync(validatedConfig, {
          skipMissingProperties: false,
        });

        if (errors.length > 0) {
          throw new Error(errors.toString());
        }
        return validatedConfig;
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ([
        {
          ttl: config.get<number>('throttle.ttl')!,
          limit: config.get<number>('throttle.limit')!,
        },
      ]),
    }),
    LoggerModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: DomainExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // protege todas las rutas; usa @Public() para excluir
    },
  ],
})
export class AppModule { }

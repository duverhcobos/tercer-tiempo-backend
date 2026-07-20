import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as path from 'node:path';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                host: configService.get('DB_HOST'),
                port: configService.get('DB_PORT'),
                username: configService.get('DB_USERNAME'),
                password: configService.get('DB_PASSWORD'),
                database: configService.get('DB_DATABASE'),
                // Auto-discovers all *.schema.ts files under /src
                entities: [path.join(__dirname, '/../../**/*.schema{.ts,.js}')],
                migrations: ['dist/src/infrastructure/database/migrations/*.js'],
                migrationsRun: true,
                // 'each' → cada migración en su propia transacción,
                // requerido para las que usan transaction = false
                // (ALTER TYPE ADD VALUE no admite BEGIN/COMMIT).
                migrationsTransactionMode: 'each',
                synchronize: false,
                logging: configService.get('NODE_ENV') === 'development',
            }),
        }),
    ],
})
export class DatabaseModule { }

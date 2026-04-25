import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { UserSchema } from './src/infrastructure/database/schemas/user.schema';

config();

const configService = new ConfigService();

export default new DataSource({
    type: 'postgres',
    host: configService.get('DB_HOST'),
    port: configService.get('DB_PORT'),
    username: configService.get('DB_USERNAME'),
    password: configService.get('DB_PASSWORD'),
    database: configService.get('DB_DATABASE'),
    entities: [UserSchema],
    migrations: ['src/infrastructure/database/migrations/*.ts'],
    synchronize: false,
});

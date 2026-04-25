# Guía Completa: Construcción de API REST con NestJS + DDD

## 📋 Tabla de Contenidos

1. [Fase 1: Configuración Inicial](#fase-1-configuración-inicial)
2. [Fase 2: Arquitectura DDD](#fase-2-arquitectura-ddd)
3. [Fase 3: Seguridad](#fase-3-seguridad)
4. [Fase 4: DevOps](#fase-4-devops)
5. [Fase 5: Observabilidad](#fase-5-observabilidad)
6. [Fase 6: Testing](#fase-6-testing)
7. [Fase 7: Documentación](#fase-7-documentación)

---

## Fase 1: Configuración Inicial

### 1.1 Crear Proyecto Base

```bash
# Instalar NestJS CLI
npm i -g @nestjs/cli

# Crear proyecto
nest new nombre-proyecto
cd nombre-proyecto
```

### 1.2 Instalar Dependencias Principales

```bash
# Base de datos
npm install @nestjs/typeorm typeorm pg

# Autenticación
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
npm install -D @types/bcrypt @types/passport-jwt

# Validación
npm install class-validator class-transformer

# Configuración
npm install @nestjs/config

# Documentación
npm install @nestjs/swagger

# Seguridad
npm install @nestjs/throttler helmet compression
npm install -D @types/compression

# Health Checks
npm install @nestjs/terminus

# Logging
npm install winston winston-daily-rotate-file

# Testing
npm install -D @types/supertest supertest
```

### 1.3 Configurar Variables de Entorno

**Crear `.env`**:
```env
# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=1234
DB_DATABASE=nombre_db

# JWT
JWT_SECRET=tu-secret-key-super-seguro-de-64-caracteres-minimo
JWT_EXPIRES_IN=1h

# Rate Limiting
THROTTLE_TTL=60000
THROTTLE_LIMIT=3

# Logging
LOG_LEVEL=info
LOG_DIR=logs
LOG_MAX_FILES=14d
LOG_MAX_SIZE=20m
```

**Crear `.env.example`** (copia de .env con valores de ejemplo)

### 1.4 Configurar Validación de Variables

**Crear `src/config/env.validation.ts`**:
```typescript
import { plainToInstance } from 'class-transformer';
import { IsString, IsNumber, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  DB_HOST: string;

  @IsNumber()
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
```

---

## Fase 2: Arquitectura DDD

### 2.1 Estructura de Carpetas

```
src/
├── config/                    # Configuraciones
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── jwt.config.ts
│   ├── throttler.config.ts
│   ├── logger.config.ts
│   └── env.validation.ts
├── common/                    # Código compartido
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   └── logger/
├── infrastructure/            # Infraestructura
│   ├── database/
│   │   ├── migrations/
│   │   └── data-source.ts
│   └── health/
└── modules/                   # Módulos de dominio
    └── auth/                  # Ejemplo: módulo de autenticación
        ├── domain/            # Capa de dominio
        │   ├── entities/
        │   ├── repositories/
        │   ├── value-objects/
        │   └── exceptions/
        ├── application/       # Capa de aplicación
        │   ├── dtos/
        │   ├── use-cases/
        │   ├── services/
        │   ├── mappers/
        │   └── swagger-schemas/
        ├── infrastructure/    # Capa de infraestructura
        │   ├── repositories/
        │   ├── services/
        │   ├── strategies/
        │   └── mappers/
        ├── presentation/      # Capa de presentación
        │   ├── controllers/
        │   ├── guards/
        │   ├── decorators/
        │   └── swagger/
        └── auth.module.ts
```

### 2.2 Crear Módulo de Autenticación (Ejemplo)

#### Paso 1: Entidad de Dominio

**`modules/auth/domain/entities/user.entity.ts`**:
```typescript
export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly password: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(email: string, password: string): User {
    return new User(
      '',
      email,
      password,
      new Date(),
      new Date(),
    );
  }
}
```

#### Paso 2: Value Objects

**`modules/auth/domain/value-objects/email.vo.ts`**:
```typescript
export class Email {
  private readonly value: string;

  constructor(email: string) {
    if (!this.isValid(email)) {
      throw new Error('Email inválido');
    }
    this.value = email;
  }

  private isValid(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  getValue(): string {
    return this.value;
  }
}
```

#### Paso 3: Excepciones de Dominio

**`modules/auth/domain/exceptions/user-already-exists.exception.ts`**:
```typescript
import { DomainException } from './domain.exception';

export class UserAlreadyExistsException extends DomainException {
  constructor(email: string) {
    super(`El usuario con email ${email} ya existe`, 409);
  }
}
```

#### Paso 4: Interfaz de Repositorio

**`modules/auth/domain/repositories/user.repository.interface.ts`**:
```typescript
import { User } from '../entities/user.entity';

export const USER_REPOSITORY = Symbol('IUserRepository');

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<User>;
}
```

#### Paso 5: Caso de Uso

**`modules/auth/application/use-cases/register.use-case.ts`**:
```typescript
import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';
import { UserAlreadyExistsException } from '../../domain/exceptions/user-already-exists.exception';

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly bcryptService: BcryptService,
  ) {}

  async execute(email: string, password: string): Promise<User> {
    const emailVO = new Email(email);
    
    const existingUser = await this.userRepository.findByEmail(emailVO.getValue());
    if (existingUser) {
      throw new UserAlreadyExistsException(emailVO.getValue());
    }

    const hashedPassword = await this.bcryptService.hash(password);
    const user = User.create(emailVO.getValue(), hashedPassword);
    
    return await this.userRepository.save(user);
  }
}
```

#### Paso 6: DTOs

**`modules/auth/application/dtos/register.dto.ts`**:
```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}
```

#### Paso 7: Implementación de Repositorio

**`modules/auth/infrastructure/repositories/user.repository.ts`**:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { UserSchema } from '../schemas/user.schema';
import { UserInfrastructureMapper } from '../mappers/user-infrastructure.mapper';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserSchema)
    private readonly repository: Repository<UserSchema>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const schema = await this.repository.findOne({ where: { email } });
    return schema ? UserInfrastructureMapper.toDomain(schema) : null;
  }

  async findById(id: string): Promise<User | null> {
    const schema = await this.repository.findOne({ where: { id } });
    return schema ? UserInfrastructureMapper.toDomain(schema) : null;
  }

  async save(user: User): Promise<User> {
    const schema = UserInfrastructureMapper.toSchema(user);
    const saved = await this.repository.save(schema);
    return UserInfrastructureMapper.toDomain(saved);
  }
}
```

#### Paso 8: Schema de TypeORM

**`modules/auth/infrastructure/schemas/user.schema.ts`**:
```typescript
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class UserSchema {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

#### Paso 9: Controlador

**`modules/auth/presentation/controllers/auth.controller.ts`**:
```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from '../../application/services/auth.service';
import { RegisterDto } from '../../application/dtos/register.dto';
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto.email, dto.password);
  }
}
```

#### Paso 10: Módulo

**`modules/auth/auth.module.ts`**:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserSchema } from './infrastructure/schemas/user.schema';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { BcryptService } from './infrastructure/services/bcrypt.service';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { AuthService } from './application/services/auth.service';
import { AuthController } from './presentation/controllers/auth.controller';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSchema]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    // Repositorios
    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },
    // Servicios
    BcryptService,
    // Casos de uso
    RegisterUseCase,
    // Servicios de aplicación
    AuthService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
```

---

## Fase 3: Seguridad

### 3.1 Configurar CORS

**En `main.ts`**:
```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

### 3.2 Configurar Helmet

**En `main.ts`**:
```typescript
import helmet from 'helmet';

app.use(helmet());
```

### 3.3 Configurar Rate Limiting

**Crear `config/throttler.config.ts`**:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('throttler', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL) || 60000,
  limit: parseInt(process.env.THROTTLE_LIMIT) || 3,
}));
```

**En `app.module.ts`**:
```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import throttlerConfig from './config/throttler.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [throttlerConfig],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get('throttler.ttl'),
          limit: config.get('throttler.limit'),
        },
      ],
      inject: [ConfigService],
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

### 3.4 Configurar Compression

**En `main.ts`**:
```typescript
import * as compression from 'compression';

app.use(compression());
```

### 3.5 Configurar Validación Global

**En `main.ts`**:
```typescript
import { ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

---

## Fase 4: DevOps

### 4.1 Configurar Base de Datos

**Crear `infrastructure/database/data-source.ts`**:
```typescript
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: ['src/**/*.schema.ts'],
  migrations: ['src/infrastructure/database/migrations/*.ts'],
  synchronize: false,
});
```

### 4.2 Crear Migración

```bash
npm run typeorm migration:create src/infrastructure/database/migrations/CreateUsersTable
```

**Editar migración**:
```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateUsersTable1706140000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'email',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'password',
            type: 'varchar',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
```

### 4.3 Configurar Docker

**Crear `docker-compose.yml`**:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: nestjs-ddd-starter_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: 1234
      POSTGRES_DB: nestjs_ddd_starter
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - nestjs-ddd-starter_network

  app:
    build: .
    container_name: nestjs-ddd-starter_api
    ports:
      - "3000:3000"
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: postgres
      DB_PASSWORD: 1234
      DB_DATABASE: nestjs_ddd_starter
    depends_on:
      - postgres
    networks:
      - nestjs-ddd-starter_network

volumes:
  postgres_data:

networks:
  nestjs-ddd-starter_network:
    driver: bridge
```

**Crear `Dockerfile`**:
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
```

### 4.4 Health Checks

**Crear `infrastructure/health/health.controller.ts`**:
```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }
}
```

---

## Fase 5: Observabilidad

### 5.1 Configurar Winston

**Crear `config/logger.config.ts`**:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('logger', () => ({
  level: process.env.LOG_LEVEL || 'info',
  dir: process.env.LOG_DIR || 'logs',
  maxFiles: process.env.LOG_MAX_FILES || '14d',
  maxSize: process.env.LOG_MAX_SIZE || '20m',
}));
```

**Crear `common/logger/logger.service.ts`**:
```typescript
import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;

  constructor(private config: ConfigService) {
    this.logger = winston.createLogger({
      level: this.config.get('logger.level'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        new DailyRotateFile({
          filename: `${this.config.get('logger.dir')}/error-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxFiles: this.config.get('logger.maxFiles'),
          maxSize: this.config.get('logger.maxSize'),
        }),
        new DailyRotateFile({
          filename: `${this.config.get('logger.dir')}/combined-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          maxFiles: this.config.get('logger.maxFiles'),
          maxSize: this.config.get('logger.maxSize'),
        }),
      ],
    });
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }
}
```

### 5.2 Filtro de Excepciones

**Crear `common/filters/domain-exception.filter.ts`**:
```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { DomainException } from '../../modules/auth/domain/exceptions/domain.exception';
import { LoggerService } from '../logger/logger.service';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof DomainException) {
      status = exception.statusCode;
      message = exception.message;
      this.logger.warn(exception.message, 'DomainExceptionFilter');
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
      this.logger.error(`HTTP exception: ${message}`, exception.stack, 'DomainExceptionFilter');
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack, 'DomainExceptionFilter');
    }

    this.logger.error(
      `${request.method} ${request.url} - ${status} ${message}`,
      exception instanceof Error ? exception.stack : undefined,
      'DomainExceptionFilter',
    );

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

---

## Fase 6: Testing

### 6.1 Tests Unitarios

**Crear `modules/auth/application/use-cases/register.use-case.spec.ts`**:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { RegisterUseCase } from './register.use-case';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';

describe('RegisterUseCase', () => {
  let useCase: RegisterUseCase;
  let userRepository: jest.Mocked<IUserRepository>;
  let bcryptService: jest.Mocked<BcryptService>;

  beforeEach(async () => {
    const mockUserRepository = {
      findByEmail: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
    };

    const mockBcryptService = {
      hash: jest.fn(),
      compare: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegisterUseCase,
        { provide: USER_REPOSITORY, useValue: mockUserRepository },
        { provide: BcryptService, useValue: mockBcryptService },
      ],
    }).compile();

    useCase = module.get<RegisterUseCase>(RegisterUseCase);
    userRepository = module.get(USER_REPOSITORY);
    bcryptService = module.get(BcryptService);
  });

  it('should register a new user successfully', async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    bcryptService.hash.mockResolvedValue('hashed_password');

    const result = await useCase.execute('test@example.com', 'Password123');

    expect(userRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(bcryptService.hash).toHaveBeenCalledWith('Password123');
    expect(userRepository.save).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
```

### 6.2 Tests E2E

**Crear `test/auth.e2e-spec.ts`**:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM users');
  });

  it('/auth/register (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'Password123' })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('accessToken');
      });
  });
});
```

### 6.3 Configurar Scripts

**En `package.json`**:
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  }
}
```

---

## Fase 7: Documentación

### 7.1 Configurar Swagger

**En `main.ts`**:
```typescript
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('API REST')
  .setDescription('Documentación de la API')
  .setVersion('1.0')
  .addTag('auth', 'Endpoints de autenticación')
  .addBearerAuth({
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  }, 'JWT-auth')
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

### 7.2 Documentar Endpoints

```typescript
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 409, description: 'El email ya está registrado' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password);
  }
}
```

### 7.3 Crear README.md

Documenta:
- Descripción del proyecto
- Tecnologías utilizadas
- Instalación
- Configuración
- Ejecución
- Testing
- Estructura del proyecto
- API endpoints

---

## 🎯 Orden de Implementación Recomendado

### Semana 1: Base
1. ✅ Crear proyecto y configurar dependencias
2. ✅ Configurar variables de entorno
3. ✅ Configurar base de datos
4. ✅ Crear primera migración

### Semana 2: Dominio
5. ✅ Crear entidades de dominio
6. ✅ Crear value objects
7. ✅ Crear excepciones de dominio
8. ✅ Crear interfaces de repositorio

### Semana 3: Aplicación
9. ✅ Crear DTOs
10. ✅ Crear casos de uso
11. ✅ Crear servicios de aplicación
12. ✅ Crear mappers

### Semana 4: Infraestructura
13. ✅ Crear schemas de TypeORM
14. ✅ Implementar repositorios
15. ✅ Crear servicios de infraestructura
16. ✅ Configurar JWT y Passport

### Semana 5: Presentación
17. ✅ Crear controladores
18. ✅ Crear guards
19. ✅ Crear decoradores
20. ✅ Configurar Swagger

### Semana 6: Seguridad
21. ✅ Configurar CORS
22. ✅ Configurar Helmet
23. ✅ Configurar Rate Limiting
24. ✅ Configurar Compression
25. ✅ Configurar validación global

### Semana 7: DevOps
26. ✅ Crear Dockerfile
27. ✅ Crear docker-compose.yml
28. ✅ Configurar health checks
29. ✅ Configurar scripts de migración

### Semana 8: Observabilidad
30. ✅ Configurar Winston
31. ✅ Crear logger service
32. ✅ Crear filtros de excepciones
33. ✅ Integrar logging en toda la app

### Semana 9: Testing
34. ✅ Crear tests unitarios
35. ✅ Crear tests e2e
36. ✅ Configurar cobertura
37. ✅ Crear .env.test

### Semana 10: Documentación
38. ✅ Completar Swagger
39. ✅ Crear README.md
40. ✅ Documentar arquitectura
41. ✅ Crear guías de uso

---

## 📚 Recursos Adicionales

### Comandos Útiles

```bash
# Desarrollo
npm run start:dev

# Producción
npm run build
npm run start:prod

# Migraciones
npm run typeorm migration:generate src/infrastructure/database/migrations/MigrationName
npm run typeorm migration:run
npm run typeorm migration:revert

# Testing
npm test
npm run test:e2e
npm run test:cov

# Docker
docker-compose up -d
docker-compose down
docker-compose logs -f
```

### Patrones Importantes

1. **Dependency Injection**: Usa interfaces y tokens
2. **Repository Pattern**: Separa lógica de datos
3. **Use Case Pattern**: Un caso de uso = una acción
4. **DTO Pattern**: Validación en la entrada
5. **Mapper Pattern**: Transforma entre capas
6. **Exception Filter**: Manejo centralizado de errores

---

## ✅ Checklist Final

Antes de considerar tu proyecto completo:

- [ ] Todas las variables de entorno documentadas
- [ ] Migraciones de base de datos creadas
- [ ] Autenticación y autorización funcionando
- [ ] Validación de DTOs en todos los endpoints
- [ ] Manejo de errores centralizado
- [ ] Logging configurado
- [ ] Health checks implementados
- [ ] Swagger documentado
- [ ] Tests unitarios > 80% cobertura
- [ ] Tests e2e para flujos principales
- [ ] Docker configurado
- [ ] README.md completo
- [ ] .gitignore configurado
- [ ] .env.example actualizado

---

## 🎉 Conclusión

Siguiendo esta guía paso a paso, construirás una aplicación NestJS de nivel enterprise con:

- ✅ Arquitectura DDD limpia y escalable
- ✅ Seguridad robusta
- ✅ DevOps production-ready
- ✅ Observabilidad completa
- ✅ Testing comprehensivo
- ✅ Documentación profesional

**¡Tu aplicación estará lista para producción!** 🚀

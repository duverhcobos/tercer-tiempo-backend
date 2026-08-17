# Propuesta: Autenticación con Google OAuth 2.0

**Estado:** ⭕ Pendiente — no implementada. Es la referencia de diseño que quedó vigente tras limpiar el código muerto en `17-remover-codigo-muerto-google-oauth.md`.

Implementa login con Google usando `passport-google-oauth20`. El flujo es:
1. El usuario va a `GET /auth/google` → es redirigido a la pantalla de Google.
2. Google regresa a `GET /auth/google/callback` con el perfil del usuario.
3. Se busca o crea el usuario en la DB.
4. Se genera y retorna un JWT idéntico al de login normal.

---

## Paso a paso: obtener las credenciales de Google

### 1. Ir a Google Cloud Console
Abre [https://console.cloud.google.com](https://console.cloud.google.com) con tu cuenta Google.

### 2. Crear o seleccionar un proyecto
- Click en el selector de proyectos (arriba a la izquierda).
- Crear nuevo proyecto → ponle nombre (ej. `3TIEMPO`) → Crear.

### 3. Habilitar la API de Google+
- En el menú lateral: **APIs y servicios → Biblioteca**.
- Busca `Google+ API` → Habilitar.
- También habilita `Google Identity` si aparece.

### 4. Configurar la pantalla de consentimiento OAuth
- Menú: **APIs y servicios → Pantalla de consentimiento OAuth**.
- Tipo de usuario: **Externo** → Crear.
- Rellena:
  - Nombre de la app: `3TIEMPO`
  - Correo de soporte: tu email
  - Correo de desarrollador: tu email
- Guardar y continuar (sin agregar scopes adicionales por ahora).

### 5. Crear las credenciales OAuth 2.0
- Menú: **APIs y servicios → Credenciales**.
- Click **+ Crear credenciales → ID de cliente de OAuth 2.0**.
- Tipo de aplicación: **Aplicación web**.
- Nombre: `3TIEMPO Backend`.
- **Orígenes autorizados de JavaScript**: `http://localhost:3000`
- **URIs de redireccionamiento autorizados** — agrega solo estos dos (los custom schemes `miapp://` **no son válidos** en credenciales web):

  | Entorno | URI |
  |---------|-----|
  | Desarrollo (backend local) | `http://localhost:3000/auth/google/callback` |
  | Postman | `https://oauth.pstmn.io/v1/callback` |
  | Producción | `https://tudominio.com/auth/google/callback` |

- Click **Crear**.

> **¿Y la app móvil?**
> La app móvil usa un flujo distinto — **no pasa por este redirect**. Ver sección al final.

#### Configuración en Postman
En la pestaña **Authorization** de tu colección:
- Type: `OAuth 2.0`
- Grant Type: `Authorization Code`
- Auth URL: `http://localhost:3000/auth/google`
- Access Token URL: *(dejar vacío — el backend genera el JWT directamente)*
- Callback URL: `https://oauth.pstmn.io/v1/callback`
- Client ID / Client Secret: los de tu `.env`
- Click **Get New Access Token** → se abre el navegador para hacer login con Google.

#### Flujo para App Móvil (cuando llegues a esa fase)
Google **no permite** `miapp://` como redirect en credenciales web. El flujo correcto para móvil es:

```
App móvil
  │
  ├─ Usa el SDK nativo de Google Sign-In (Google Identity para Flutter/React Native)
  │  → el usuario hace login en la app directamente
  │  → Google retorna un id_token (JWT firmado por Google)
  │
  ▼
POST /auth/google/mobile   ← nuevo endpoint en el backend
  Body: { "idToken": "eyJhbGc..." }
  │
  ├─ Backend verifica el id_token con las claves públicas de Google
  ├─ Extrae email + googleId del payload
  ├─ Ejecuta el mismo GoogleLoginUseCase (find-or-create)
  └─ Retorna tu JWT propio
```

Para la app móvil en Google Console se crea una credencial **separada** de tipo **Android** o **iOS** (no "Aplicación web"), que sí soporta el bundle ID / package name. Esto se implementa cuando integres el frontend móvil.

### 6. Copiar las credenciales
Se te mostrarán:
- **Client ID** → cópialo a `.env` como `GOOGLE_CLIENT_ID`
- **Client Secret** → cópialo a `.env` como `GOOGLE_CLIENT_SECRET`

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/infrastructure/database/migrations/1751000000000-AddGoogleAuthToUsers.ts` | Crear — migración |
| `src/infrastructure/database/schemas/user.schema.ts` | Modificar — columnas `google_id`, `avatar_url`, `password_hash` nullable |
| `src/modules/auth/domain/entities/user.entity.ts` | Modificar — campos `googleId`, `avatarUrl` |
| `src/modules/auth/domain/repositories/user.repository.interface.ts` | Modificar — método `findByGoogleId` |
| `src/modules/auth/infrastructure/repositories/user.repository.ts` | Modificar — implementar `findByGoogleId` |
| `src/modules/auth/infrastructure/mappers/user.mapper.ts` | Modificar — mapear nuevos campos |
| `src/modules/auth/infrastructure/strategies/google.strategy.ts` | Crear — estrategia Passport Google |
| `src/modules/auth/presentation/guards/google-auth.guard.ts` | Crear — guard para iniciar OAuth |
| `src/modules/auth/application/use-cases/google-login.use-case.ts` | Crear — lógica find-or-create |
| `src/modules/auth/application/services/auth.service.ts` | Modificar — método `googleLogin` |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Modificar — rutas Google |
| `src/config/env.validation.ts` | Modificar — validar variables Google |
| `src/modules/auth/auth.module.ts` | Modificar — registrar nuevos providers |
| `.env` | Modificar — agregar variables (manual) |

---

## Instalar dependencias

```bash
pnpm add passport-google-oauth20
pnpm add -D @types/passport-google-oauth20
```

---

## 1. Migración

**Ruta:** `src/infrastructure/database/migrations/1751000000000-AddGoogleAuthToUsers.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleAuthToUsers1751000000000 implements MigrationInterface {
    name = 'AddGoogleAuthToUsers1751000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Hacer password_hash nullable (usuarios que solo usan Google no tienen contraseña)
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "password_hash" DROP NOT NULL
        `);

        // Agregar columna google_id
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN "google_id" VARCHAR(255) NULL UNIQUE
        `);

        // Agregar columna avatar_url
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN "avatar_url" TEXT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "google_id"`);
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "password_hash" SET NOT NULL
        `);
    }
}
```

---

## 2. UserSchema

**Ruta:** `src/infrastructure/database/schemas/user.schema.ts`

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class UserSchema {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ unique: true })
    email!: string;

    @Column({ name: 'password_hash', nullable: true })
    passwordHash!: string | null;

    @Column({ name: 'phone_number', nullable: true, length: 20 })
    phoneNumber!: string;

    @Column({ name: 'sync_id', type: 'uuid', nullable: true, unique: true })
    syncId!: string;

    @Column({ name: 'google_id', nullable: true, unique: true })
    googleId!: string | null;

    @Column({ name: 'avatar_url', nullable: true, type: 'text' })
    avatarUrl!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
```

---

## 3. User Entity (dominio)

**Ruta:** `src/modules/auth/domain/entities/user.entity.ts`

```typescript
export class User {
    constructor(
        public readonly id: string,
        public readonly email: string,
        public readonly password: string | null,
        public readonly phone: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly googleId: string | null = null,
        public readonly avatarUrl: string | null = null,
    ) { }

    static create(email: string, password: string, phone?: string): User {
        return new User(
            '',
            email,
            password,
            phone || null,
            new Date(),
            new Date(),
        );
    }

    static createFromGoogle(email: string, googleId: string, avatarUrl?: string): User {
        return new User(
            '',
            email,
            null,       // sin contraseña
            null,
            new Date(),
            new Date(),
            googleId,
            avatarUrl || null,
        );
    }
}
```

---

## 4. IUserRepository

**Ruta:** `src/modules/auth/domain/repositories/user.repository.interface.ts`

```typescript
import { User } from '../entities/user.entity';

export interface IUserRepository {
    findByEmail(email: string): Promise<User | null>;
    findByGoogleId(googleId: string): Promise<User | null>;
    save(user: User): Promise<User>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
```

---

## 5. UserRepository

**Ruta:** `src/modules/auth/infrastructure/repositories/user.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class UserRepository implements IUserRepository {
    constructor(
        @InjectRepository(UserSchema)
        private readonly userSchemaRepository: Repository<UserSchema>,
    ) { }

    async findByEmail(email: string): Promise<User | null> {
        const userSchema = await this.userSchemaRepository.findOne({
            where: { email },
        });

        return userSchema ? UserMapper.toDomain(userSchema) : null;
    }

    async findByGoogleId(googleId: string): Promise<User | null> {
        const userSchema = await this.userSchemaRepository.findOne({
            where: { googleId },
        });

        return userSchema ? UserMapper.toDomain(userSchema) : null;
    }

    async save(user: User): Promise<User> {
        const userSchema = UserMapper.toSchema(user);
        const savedSchema = await this.userSchemaRepository.save(userSchema);
        return UserMapper.toDomain(savedSchema);
    }
}
```

---

## 6. UserMapper

**Ruta:** `src/modules/auth/infrastructure/mappers/user.mapper.ts`

```typescript
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { User } from '../../domain/entities/user.entity';

export class UserMapper {
    static toDomain(schema: UserSchema): User {
        return new User(
            schema.id,
            schema.email,
            schema.passwordHash,
            schema.phoneNumber || null,
            schema.createdAt,
            schema.updatedAt,
            schema.googleId || null,
            schema.avatarUrl || null,
        );
    }

    static toSchema(user: User): UserSchema {
        const schema = new UserSchema();

        if (user.id) {
            schema.id = user.id;
        }

        schema.email = user.email;
        schema.passwordHash = user.password;

        if (user.phone) {
            schema.phoneNumber = user.phone;
        }

        if (user.googleId) {
            schema.googleId = user.googleId;
        }

        if (user.avatarUrl) {
            schema.avatarUrl = user.avatarUrl;
        }

        return schema;
    }

    static toDomainList(schemas: UserSchema[]): User[] {
        return schemas.map(schema => this.toDomain(schema));
    }
}
```

---

## 7. GoogleStrategy

**Ruta:** `src/modules/auth/infrastructure/strategies/google.strategy.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { AuthService } from '../../application/services/auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(
        private readonly configService: ConfigService,
        private readonly authService: AuthService,
    ) {
        super({
            clientID: configService.get<string>('GOOGLE_CLIENT_ID')!,
            clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
            callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL')!,
            scope: ['email', 'profile'],
        });
    }

    async validate(
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
    ): Promise<void> {
        const { id, emails, photos } = profile;
        const email = emails?.[0]?.value;
        const avatarUrl = photos?.[0]?.value;

        if (!email) {
            return done(new Error('No email returned from Google'), undefined);
        }

        // find-or-create del usuario en la DB
        const result = await this.authService.googleLogin({
            googleId: id,
            email,
            avatarUrl,
        });

        done(null, result);
    }
}
```

---

## 8. GoogleAuthGuard

**Ruta:** `src/modules/auth/presentation/guards/google-auth.guard.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
```

---

## 9. GoogleLoginUseCase

**Ruta:** `src/modules/auth/application/use-cases/google-login.use-case.ts`

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';

export interface GoogleProfile {
    googleId: string;
    email: string;
    avatarUrl?: string;
}

@Injectable()
export class GoogleLoginUseCase {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
    ) { }

    async execute(profile: GoogleProfile): Promise<User> {
        // 1. Buscar por googleId
        let user = await this.userRepository.findByGoogleId(profile.googleId);

        if (user) {
            return user;
        }

        // 2. Si ya tiene cuenta con ese email (registro normal), vincular el googleId
        user = await this.userRepository.findByEmail(profile.email);

        if (user) {
            // Actualizar con el googleId para vincular la cuenta
            const linked = new User(
                user.id,
                user.email,
                user.password,
                user.phone,
                user.createdAt,
                new Date(),
                profile.googleId,
                profile.avatarUrl || user.avatarUrl,
            );
            return this.userRepository.save(linked);
        }

        // 3. Crear cuenta nueva con Google
        const newUser = User.createFromGoogle(
            profile.email,
            profile.googleId,
            profile.avatarUrl,
        );

        return this.userRepository.save(newUser);
    }
}
```

---

## 10. AuthService

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { GoogleLoginUseCase, GoogleProfile } from '../use-cases/google-login.use-case';
import { JwtService } from '../../infrastructure/services/jwt.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { AuthMapper } from '../mappers/auth.mapper';

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
        private readonly googleLoginUseCase: GoogleLoginUseCase,
        private readonly jwtService: JwtService,
    ) { }

    async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
        const user = await this.registerUseCase.execute(
            registerDto.email,
            registerDto.password,
            registerDto.phone,
        );

        const accessToken = this.jwtService.generateToken({
            sub: user.id,
            email: user.email,
        });

        return AuthMapper.toAuthResponse(user, accessToken);
    }

    async login(loginDto: LoginDto): Promise<AuthResponseDto> {
        const user = await this.loginUseCase.execute(
            loginDto.email,
            loginDto.password,
        );

        const accessToken = this.jwtService.generateToken({
            sub: user.id,
            email: user.email,
        });

        return AuthMapper.toAuthResponse(user, accessToken);
    }

    async googleLogin(profile: GoogleProfile): Promise<AuthResponseDto> {
        const user = await this.googleLoginUseCase.execute(profile);

        const accessToken = this.jwtService.generateToken({
            sub: user.id,
            email: user.email,
        });

        return AuthMapper.toAuthResponse(user, accessToken);
    }
}
```

---

## 11. AuthController

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

```typescript
import { Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from '../../application/services/auth.service';
import { RegisterDto } from '../../application/dtos/register.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { Public } from '../decorators/public.decorator';
import { GoogleAuthGuard } from '../guards/google-auth.guard';
import { ApiRegister, ApiLogin } from '../swagger/auth-controller.swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @ApiRegister()
    async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
        return this.authService.register(registerDto);
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @ApiLogin()
    async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
        return this.authService.login(loginDto);
    }

    // Paso 1: redirige al usuario a la pantalla de consent de Google
    @Public()
    @UseGuards(GoogleAuthGuard)
    @Get('google')
    googleAuth(): void {
        // Passport maneja la redirección automáticamente
    }

    // Paso 2: Google regresa aquí con el perfil del usuario
    @Public()
    @UseGuards(GoogleAuthGuard)
    @Get('google/callback')
    async googleCallback(
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        // req.user es el AuthResponseDto retornado por GoogleStrategy.validate()
        const authResponse = req.user as AuthResponseDto;

        // Opción A — retornar el JWT como JSON (para apps SPA/mobile)
        res.json(authResponse);

        // Opción B — redirigir al frontend con el token en query param (para web tradicional)
        // res.redirect(`http://localhost:3001/auth/callback?token=${authResponse.accessToken}`);
    }
}
```

---

## 12. env.validation.ts

**Ruta:** `src/config/env.validation.ts`

```typescript
import { IsString, IsInt, Min, Max, IsNotEmpty, IsUrl } from 'class-validator';

export class EnvironmentVariables {
    @IsString()
    @IsNotEmpty()
    DB_HOST: string;

    @IsInt()
    @Min(1)
    @Max(65535)
    DB_PORT: number;

    @IsString()
    @IsNotEmpty()
    DB_USERNAME: string;

    @IsString()
    @IsNotEmpty()
    DB_PASSWORD: string;

    @IsString()
    @IsNotEmpty()
    DB_DATABASE: string;

    @IsString()
    @IsNotEmpty()
    JWT_SECRET: string;

    @IsString()
    @IsNotEmpty()
    JWT_EXPIRES_IN: string;

    @IsString()
    @IsNotEmpty()
    GOOGLE_CLIENT_ID: string;

    @IsString()
    @IsNotEmpty()
    GOOGLE_CLIENT_SECRET: string;

    @IsString()
    @IsNotEmpty()
    GOOGLE_CALLBACK_URL: string;
}
```

---

## 13. AuthModule

**Ruta:** `src/modules/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

// Infrastructure
import { UserSchema } from '../../infrastructure/database/schemas/user.schema';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { BcryptService } from './infrastructure/services/bcrypt.service';
import { JwtService } from './infrastructure/services/jwt.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { GoogleStrategy } from './infrastructure/strategies/google.strategy';

// Application
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { GoogleLoginUseCase } from './application/use-cases/google-login.use-case';
import { AuthService } from './application/services/auth.service';

// Presentation
import { AuthController } from './presentation/controllers/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';

// Domain
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';

@Module({
    imports: [
        ConfigModule,
        PassportModule,
        TypeOrmModule.forFeature([UserSchema]),
    ],
    controllers: [AuthController],
    providers: [
        // Infrastructure
        {
            provide: USER_REPOSITORY,
            useClass: UserRepository,
        },
        BcryptService,
        JwtService,
        JwtStrategy,
        GoogleStrategy,

        // Application
        RegisterUseCase,
        LoginUseCase,
        GoogleLoginUseCase,
        AuthService,

        // Presentation
        JwtAuthGuard,
    ],
    exports: [JwtAuthGuard, JwtService],
})
export class AuthModule { }
```

---

## 14. Variables de entorno a agregar en `.env`

```env
GOOGLE_CLIENT_ID=tu-client-id-de-google.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

---

## Orden de aplicación

1. Instalar dependencias: `pnpm add passport-google-oauth20 && pnpm add -D @types/passport-google-oauth20`
2. Agregar las 3 variables de Google en `.env`
3. Ejecutar la migración: `pnpm typeorm migration:run`
4. Aplicar cambios en este orden:
   1. `user.schema.ts`
   2. `user.entity.ts`
   3. `user.repository.interface.ts`
   4. `user.repository.ts`
   5. `user.mapper.ts`
   6. `google.strategy.ts` ← nuevo
   7. `google-auth.guard.ts` ← nuevo
   8. `google-login.use-case.ts` ← nuevo
   9. `auth.service.ts`
   10. `auth.controller.ts`
   11. `env.validation.ts`
   12. `auth.module.ts`

# Propuesta: Aplicar validación real al endpoint POST /auth/verify-email

## Problema

`AuthController.verifyEmail` recibe el token directamente con `@Query('token') token: string`, ignorando el DTO `VerifyEmailDto` que ya existe con las validaciones correctas:

```typescript
// application/dtos/verify-email.dto.ts (ya existente, nunca se usa)
export class VerifyEmailDto {
    @IsString()
    @IsNotEmpty()
    @Length(64, 64, { message: 'token must be exactly 64 characters' })
    token!: string;
}
```

```typescript
// presentation/controllers/auth.controller.ts (actual)
async verifyEmail(@Query('token') token: string): Promise<{ message: string }> {
    return this.authService.verifyEmail({ token });
}
```

Como el parámetro no está decorado con `@Query() dto: VerifyEmailDto`, el `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) nunca se ejecuta sobre este endpoint. En la práctica esto significa:

- Un `token` omitido, vacío, de longitud arbitraria, o enviado dos veces (`?token=a&token=b`, que Express interpreta como array) llega sin ningún filtro hasta `VerifyEmailUseCase` y la capa de persistencia.
- Se validó en `test/verify-email.e2e-spec.ts` que hoy esto **no es explotable** — TypeORM 0.3.28 maneja esos casos raros devolviendo `null` en `findByToken`, y el use-case ya lanza `VerificationTokenInvalidException` (400) — pero el endpoint no tiene ninguna red de seguridad propia si cambia el ORM, la query, o se refactoriza el repositorio.
- Es inconsistente con el resto de endpoints del módulo (`register`, `login`), que sí validan su entrada vía DTO antes de llegar a la capa de aplicación.

## Solución

Usar `@Query() dto: VerifyEmailDto` en vez de `@Query('token') token: string`, dejando que el `ValidationPipe` global valide `IsString`, `IsNotEmpty` y `Length(64, 64)` **antes** de que la petición llegue al servicio. Esto responde con `400 Bad Request` y un mensaje descriptivo (`"token must be exactly 64 characters"`, etc.) en vez de depender de que la capa de persistencia interprete correctamente un valor malformado.

No se modifica `VerifyEmailDto` ni `AuthService.verifyEmail` (ya recibe `{ token: string }`, compatible con la instancia del DTO).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar — usar `@Query() dto: VerifyEmailDto` |
| `test/verify-email.e2e-spec.ts` | Actualizar — ajustar aserciones de validación a 400 explícito |

---

## 1. AuthController (estado acumulativo)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

```typescript
import { Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards, Req, Res, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../application/services/auth.service';
import { RegisterDto } from '../../application/dtos/register.dto';

import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { Public } from '../decorators/public.decorator';
import { LoginDto } from '../../application/dtos/login.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    // @ApiRegister()
    async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
        return this.authService.register(registerDto);
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    // @ApiLogin()
    async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
        return this.authService.login(loginDto);
    }

    @Public()
    @Post('verify-email')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    // @ApiVerifyEmail()
    async verifyEmail(@Query() dto: VerifyEmailDto): Promise<{ message: string }> {
        return this.authService.verifyEmail(dto);
    }

    // Paso 1: redirige al usuario a la pantalla de consent de Google
    // @Public()
    // @UseGuards(GoogleAuthGuard)
    // @Get('google')
    // googleAuth(): void {
    //     // Passport maneja la redirección automáticamente
    // }

    // Paso 2: Google regresa aquí con el perfil del usuario
    // @Public()
    // @UseGuards(GoogleAuthGuard)
    // @Get('google/callback')
    // async googleCallback(
    //     @Req() req: Request,
    //     @Res() res: Response,
    // ): Promise<void> {
    //     const authResponse = req.user as AuthResponseDto;
    //     res.json(authResponse);
    // }
}
```

**Nota:** `AuthService.verifyEmail(dto: VerifyEmailDto)` ya acepta un objeto `{ token: string }`, así que `authService.verifyEmail(dto)` es compatible sin cambios adicionales en la capa de aplicación.

---

## 2. Ajustes en los tests e2e

**Ruta:** `test/verify-email.e2e-spec.ts`

Con la validación activa, los siguientes casos de la categoría **"Validación de entrada"** ahora responden `400` con mensajes de `class-validator` (antes respondían `400` igual, pero por el mensaje genérico `"Verification token is invalid or has already been used"` proveniente del use-case). Se actualizan las aserciones para reflejar el mensaje correcto y hacerlas más estrictas:

```typescript
describe('Validación de entrada', () => {
    it('400 — token omitido por completo', async () => {
        const res = await request(app.getHttpServer())
            .post('/auth/verify-email')
            .expect(400);

        expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringContaining('token')]),
        );
    });

    it('400 — token vacío', async () => {
        const res = await request(app.getHttpServer())
            .post('/auth/verify-email')
            .query({ token: '' })
            .expect(400);

        expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringContaining('token')]),
        );
    });

    it('400 — token con longitud distinta a 64 caracteres es rechazado por validación de formato', async () => {
        await registerAndGetToken();

        const res = await request(app.getHttpServer())
            .post('/auth/verify-email')
            .query({ token: 'short' })
            .expect(400);

        expect(res.body.message).toEqual(
            expect.arrayContaining([expect.stringContaining('64 characters')]),
        );
    });

    it('400 — token enviado dos veces (array) es rechazado por validación de tipo', async () => {
        const { token: token1 } = await registerAndGetToken({ email: 'v1@ejemplo.com', username: 'v1_user' });
        const { email: email2 } = await registerAndGetToken({ email: 'v2@ejemplo.com', username: 'v2_user' });

        // token=<válido de user1>&token=otro-valor -> Express arma un array,
        // que @IsString() ahora rechaza explícitamente.
        await request(app.getHttpServer())
            .post(`/auth/verify-email?token=${token1}&token=otro-valor`)
            .send()
            .expect(400);

        expect(await getUserStatus(email2)).toBe('pending_verification');
    });

    it('SQLi en el query param token no verifica cuentas arbitrarias', async () => {
        const { email } = await registerAndGetToken();

        // "' OR '1'='1" no mide 64 caracteres, así que ahora se rechaza en la
        // validación de formato (400) antes de llegar al use-case.
        await request(app.getHttpServer())
            .post('/auth/verify-email')
            .query({ token: "' OR '1'='1" })
            .expect(400);

        expect(await getUserStatus(email)).toBe('pending_verification');
    });
});
```

El resto de la suite (`Happy path`, `Replay de token`, `Expiración`, `Token inexistente o inválido`, `Aislamiento entre usuarios`) no cambia: siguen usando tokens de 64 caracteres hexadecimales reales, por lo que pasan igual la nueva validación de formato antes de llegar al use-case.

---

## Orden de aplicación

1. Actualizar `src/modules/auth/presentation/controllers/auth.controller.ts`.
2. Actualizar `test/verify-email.e2e-spec.ts` (categoría "Validación de entrada").
3. Ejecutar `npm run test:e2e -- test/verify-email.e2e-spec.ts` y confirmar 12/12 en verde.
4. Ejecutar `npm run test:e2e` completo para confirmar que no hay regresiones en `auth.e2e-spec.ts` ni `login.e2e-spec.ts`.

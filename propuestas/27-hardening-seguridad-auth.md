# Propuesta: Hardening de seguridad en auth (errores internos, timing attack, password policy, JWT, email VO)

**Estado:** ⭕ Pendiente — no aplicada aún.

Agrupa 5 correcciones de seguridad puntuales encontradas al auditar el código ya implementado de `auth` (no son features nuevas, son endurecimiento de lo que ya existe). Todas son cambios chicos y localizados, sin tocar el flujo de negocio de ningún endpoint.

---

## Problema

1. **Filtración de mensajes de error internos al cliente.** `UnknownErrorHandler.handle()` devuelve `exception.message` tal cual en cualquier error 500, en cualquier ambiente (incluido producción). Un fallo de conexión a Postgres, un constraint violado, o cualquier excepción no controlada puede filtrar nombres de tablas/columnas o detalles internos del stack en la respuesta HTTP.

2. **Enumeración de emails por timing attack en `login`.** `LoginUseCase` corta inmediatamente si el email no existe (`throw new InvalidCredentialsException()`), pero si el email existe corre `bcryptService.compare(...)` (deliberadamente lento, ~80-100ms) antes de fallar. La diferencia de tiempo de respuesta entre "email no existe" y "email existe, password incorrecto" permite a un atacante enumerar qué emails están registrados, aunque el mensaje de error sea idéntico en ambos casos.

3. **Password sin política real.** `Password` (value object) solo valida longitud mínima (8 caracteres) y no tiene máximo. bcrypt trunca internamente cualquier input a 72 bytes de forma silenciosa: dos contraseñas que comparten los primeros 72 bytes autentican igual sin que el usuario lo note. Tampoco hay límite de tamaño en el DTO (`RegisterDto.password` solo tiene `@MinLength(8)`), por lo que se puede enviar un string arbitrariamente largo al endpoint antes de llegar al VO.

4. **JWT sin algoritmo fijado explícitamente.** Ni `JwtService.generateToken`/`verifyToken` ni las opciones de `JwtStrategy` (Passport) especifican `algorithms: ['HS256']`. Hoy no es explotable (solo se usa HS256), pero es una práctica de seguridad estándar fijarlo en ambos lados — evita el ataque clásico de "algorithm confusion" si en el futuro se introduce una llave asimétrica en algún otro flujo sin actualizar todos los puntos de verificación.

5. **`Email` (value object) sin límite de longitud.** La validación (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) no limita el tamaño del string, permitiendo valores arbitrariamente largos antes de llegar a la base de datos.

## Solución

- Sanitizar el mensaje devuelto al cliente en `UnknownErrorHandler`: en producción (`NODE_ENV === 'production'`), responder siempre `"Internal server error"`; fuera de producción, mantener el mensaje real para facilitar debugging local. El log completo (con stack) ya se guarda en `DomainExceptionFilter` sin cambios.
- Normalizar el tiempo de respuesta de `LoginUseCase`: cuando el email no existe, ejecutar igual un `bcryptService.compare(...)` contra un hash "señuelo" fijo antes de lanzar la excepción, para que el tiempo de respuesta sea equivalente al caso de contraseña incorrecta.
- Agregar longitud máxima a `Password` (72 caracteres, límite efectivo de bcrypt) y reflejar el mismo máximo en `RegisterDto` vía `@MaxLength(72)`.
- Fijar `algorithms: ['HS256']` explícitamente en `jwt.sign`, `jwt.verify` y las opciones de `JwtStrategy`.
- Agregar longitud máxima a `Email` (254 caracteres, límite de RFC 5321) y reflejar el mismo máximo en `RegisterDto` vía `@MaxLength(254)` en el campo `email`.

No se modifica ningún DTO de `LoginDto` (la validación de longitud de password en login no aplica — ahí se compara contra un hash existente, no se crea uno nuevo).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/common/filters/handlers/unknown-error.handler.ts` | Actualizar — sanitizar mensaje en producción |
| `src/modules/auth/application/use-cases/login.use-case.ts` | Actualizar — comparación señuelo para normalizar timing |
| `src/modules/auth/domain/value-objects/password.vo.ts` | Actualizar — agregar longitud máxima |
| `src/modules/auth/application/dtos/register.dto.ts` | Actualizar — `@MaxLength` en `password` y `email` |
| `src/modules/auth/infrastructure/services/jwt.service.ts` | Actualizar — fijar `algorithms: ['HS256']` |
| `src/modules/auth/infrastructure/strategies/jwt.strategy.ts` | Actualizar — fijar `algorithms: ['HS256']` |
| `src/modules/auth/domain/value-objects/email.vo.ts` | Actualizar — agregar longitud máxima |

---

## 1. `unknown-error.handler.ts` (archivo existente — actualización)

**Ruta:** `src/common/filters/handlers/unknown-error.handler.ts`

**Antes:**
```typescript
export class UnknownErrorHandler implements ExceptionHandler {
    canHandle(exception: unknown): boolean {
        return exception instanceof Error;
    }

    handle(exception: Error): { status: number; message: string } {
        return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: exception.message,
        };
    }
}
```

**Después:**
```typescript
export class UnknownErrorHandler implements ExceptionHandler {
    canHandle(exception: unknown): boolean {
        return exception instanceof Error;
    }

    handle(exception: Error): { status: number; message: string } {
        // En producción no se expone el mensaje real del error al cliente
        // (puede filtrar detalles internos: nombres de tabla/columna, stack, etc.).
        // El mensaje completo ya queda registrado en el log por DomainExceptionFilter.
        const isProduction = process.env.NODE_ENV === 'production';

        return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: isProduction ? 'Internal server error' : exception.message,
        };
    }
}
```

## 2. `login.use-case.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/use-cases/login.use-case.ts`

**Antes:**
```typescript
@Injectable()
export class LoginUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService
    ) { }

    async execute(command: { email: string, password: string }): Promise<User> {

        const user = await this.userRepository.findByEmailWithRole(command.email);
        user || (() => { throw new InvalidCredentialsException() })();

        const isPasswordValid = await this.bcryptService.compare(command.password, user.password);
        isPasswordValid || (() => { throw new InvalidCredentialsException() })();
```

**Después:**
```typescript
// Hash señuelo, sin relación con ningún usuario real. Se usa únicamente para
// que bcrypt.compare() se ejecute con el mismo costo cuando el email no existe,
// evitando que el tiempo de respuesta delate si un email está registrado o no.
const DUMMY_PASSWORD_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8s/hVpVfbwvQaVJZZ/nY8xz7sZjyMi';

@Injectable()
export class LoginUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService
    ) { }

    async execute(command: { email: string, password: string }): Promise<User> {

        const user = await this.userRepository.findByEmailWithRole(command.email);

        if (!user) {
            // Se ejecuta igual el compare (contra un hash señuelo) para que el
            // tiempo de respuesta sea equivalente al caso "password incorrecto"
            // y no permita enumerar emails registrados por timing.
            await this.bcryptService.compare(command.password, DUMMY_PASSWORD_HASH);
            throw new InvalidCredentialsException();
        }

        const isPasswordValid = await this.bcryptService.compare(command.password, user.password);
        isPasswordValid || (() => { throw new InvalidCredentialsException() })();
```

(el resto del método —validaciones de `status` y `updateLastLoginAt`— queda igual)

## 3. `password.vo.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/domain/value-objects/password.vo.ts`

**Antes:**
```typescript
    private validate(password: string): void {
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
    }
```

**Después:**
```typescript
    private validate(password: string): void {
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
        // bcrypt trunca silenciosamente cualquier input a 72 bytes: sin este
        // límite, dos passwords que compartan ese prefijo autenticarían igual.
        if (password.length > 72) {
            throw new Error('Password must be at most 72 characters long');
        }
    }
```

## 4. `register.dto.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/dtos/register.dto.ts`

**Antes:**
```typescript
    @IsEmail()
    @IsNotEmpty()
    email!: string;
```

**Después:**
```typescript
    @IsEmail()
    @IsNotEmpty()
    @MaxLength(254, { message: 'Email must be at most 254 characters' })
    email!: string;
```

**Antes:**
```typescript
    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @IsNotEmpty({ message: 'Password is required' })
    password!: string;
```

**Después:**
```typescript
    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @MaxLength(72, { message: 'Password must be at most 72 characters long' })
    @IsNotEmpty({ message: 'Password is required' })
    password!: string;
```

(`MaxLength` ya está importado en este archivo — se usa para `username`)

## 5. `jwt.service.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/infrastructure/services/jwt.service.ts`

**Antes:**
```typescript
    generateToken(payload: { sub: string; email: string }): string {
        const secret = this.getSecret();
        const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '24h';

        return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
    }

    verifyToken(token: string): any {
        const secret = this.getSecret();
        return jwt.verify(token, secret);
    }
```

**Después:**
```typescript
    generateToken(payload: { sub: string; email: string }): string {
        const secret = this.getSecret();
        const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '24h';

        return jwt.sign(payload, secret, { expiresIn, algorithm: 'HS256' } as jwt.SignOptions);
    }

    verifyToken(token: string): any {
        const secret = this.getSecret();
        // Fijar el algoritmo esperado evita ataques de "algorithm confusion"
        // si en el futuro se agrega algún flujo con llaves asimétricas.
        return jwt.verify(token, secret, { algorithms: ['HS256'] });
    }
```

## 6. `jwt.strategy.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/infrastructure/strategies/jwt.strategy.ts`

**Antes:**
```typescript
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret,
        });
```

**Después:**
```typescript
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret,
            algorithms: ['HS256'],
        });
```

## 7. `email.vo.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/domain/value-objects/email.vo.ts`

**Antes:**
```typescript
    private validate(email: string): void {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email address');
        }
    }
```

**Después:**
```typescript
    private validate(email: string): void {
        // RFC 5321 limita la longitud total de una dirección de email a 254 caracteres.
        if (email.length > 254) {
            throw new Error('Email must be at most 254 characters');
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email address');
        }
    }
```

---

## Notas

- El hash señuelo (`DUMMY_PASSWORD_HASH`) es un string fijo con formato bcrypt válido, sin relación con ninguna contraseña real — su único propósito es forzar a que `bcrypt.compare()` haga el mismo trabajo computacional que en el caso "email existe, password incorrecto". No requiere mantenimiento ni rotación.
- Ninguno de estos cambios afecta contraseñas ya existentes en la base de datos: usuarios con contraseñas de más de 72 caracteres (si los hubiera) no se ven afectados retroactivamente — el límite de `Password.validate()` solo aplica al crear una instancia nueva del VO (registro), no a la verificación en login (que compara contra el hash ya guardado).
- No se agrega ninguna dependencia nueva.
- No se toca ningún test existente que no dependa directamente del comportamiento cambiado; si algún `.spec.ts` de `login.use-case.spec.ts` o `password.vo.spec.ts` (si existiera) asume el comportamiento anterior, debe actualizarse en la misma tanda (ver skill `unit-test-checklist`).

## Orden de aplicación

1. Actualizar `unknown-error.handler.ts`.
2. Actualizar `login.use-case.ts` (agregar constante `DUMMY_PASSWORD_HASH` y la rama del email inexistente).
3. Actualizar `password.vo.ts`.
4. Actualizar `register.dto.ts`.
5. Actualizar `jwt.service.ts`.
6. Actualizar `jwt.strategy.ts`.
7. Actualizar `email.vo.ts`.
8. Ejecutar `npm run test` y confirmar que `login.use-case.spec.ts` sigue pasando (agregar un caso nuevo: "email inexistente ejecuta bcryptService.compare contra el hash señuelo antes de lanzar `InvalidCredentialsException`").

# Propuesta: Agregar errorCode a respuestas de error de dominio

**Estado:** ✅ Completado — `DomainException` tiene `errorCode` y las excepciones existentes (ej. `EmailNotVerifiedException`) ya lo usan.

El frontend necesita un campo estable para distinguir tipos de error del mismo HTTP status code (p.ej. dos errores 403 distintos). Se agrega `errorCode` en formato `SCREAMING_SNAKE_CASE` a todas las respuestas de error de dominio.

**Antes:**
```json
{ "statusCode": 403, "message": "Email address has not been verified", "timestamp": "..." }
```

**Después:**
```json
{ "statusCode": 403, "errorCode": "EMAIL_NOT_VERIFIED", "message": "Email address has not been verified", "timestamp": "..." }
```

---

## Uso en el frontend

```typescript
// Ejemplo genérico (aplica a React, Flutter, Kotlin, Swift, etc.)
catch (error) {
    switch (error.body.errorCode) {
        case 'EMAIL_NOT_VERIFIED':  router.push('/verify-email');      break;
        case 'ACCOUNT_SUSPENDED':   router.push('/account-suspended'); break;
        case 'ACCOUNT_BANNED':      router.push('/account-banned');    break;
        case 'INVALID_CREDENTIALS': showError('Email o contraseña incorrectos'); break;
    }
}
```

---

## Catálogo de errorCodes

| errorCode | HTTP | Excepción |
|-----------|------|-----------|
| `EMAIL_NOT_VERIFIED` | 403 | EmailNotVerifiedException |
| `ACCOUNT_SUSPENDED` | 403 | AccountSuspendedException |
| `ACCOUNT_BANNED` | 403 | AccountBannedException |
| `INVALID_CREDENTIALS` | 401 | InvalidCredentialsException |
| `EMAIL_ALREADY_EXISTS` | 409 | UserAlreadyExistsException |
| `USERNAME_ALREADY_EXISTS` | 409 | UsernameAlreadyExistsException |
| `USER_NOT_FOUND` | 404 | UserNotFoundException |
| `VERIFICATION_TOKEN_INVALID` | 400 | VerificationTokenInvalidException |
| `VERIFICATION_TOKEN_EXPIRED` | 400 | VerificationTokenExpiredException |
| `EMAIL_ALREADY_VERIFIED` | 409 | EmailAlreadyVerifiedException |
| `PROFILE_ALREADY_EXISTS` | 409 | ProfileAlreadyExistsException |

> Errores sin `errorCode` (validación de clase-validator, errores HTTP genéricos, errores internos) siguen respondiendo igual que antes.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/common/exceptions/domain.exception.ts` | Actualizar — agregar `errorCode` |
| `src/common/filters/handlers/exception-handler.interface.ts` | Actualizar — agregar `errorCode` al tipo de retorno |
| `src/common/filters/handlers/domain-exception.handler.ts` | Actualizar — retornar `errorCode` |
| `src/common/filters/domain-exception.filter.ts` | Actualizar — incluir `errorCode` en el JSON |
| `src/modules/auth/domain/exceptions/email-not-verified.exception.ts` | Actualizar |
| `src/modules/auth/domain/exceptions/account-suspended.exception.ts` | Actualizar |
| `src/modules/auth/domain/exceptions/account-banned.exception.ts` | Actualizar |
| `src/modules/auth/domain/exceptions/invalid-credentials.exception.ts` | Actualizar |
| `src/modules/auth/domain/exceptions/user-already-exists.exception.ts` | Actualizar |
| `src/modules/auth/domain/exceptions/username-already-exists.exception.ts` | Actualizar |
| `src/modules/auth/domain/exceptions/user-not-found.exception.ts` | Actualizar |
| `src/modules/auth/domain/exceptions/verification-token-invalid.exception.ts` | Actualizar |
| `src/modules/auth/domain/exceptions/verification-token-expired.exception.ts` | Actualizar |

---

## 1. domain.exception.ts

**Ruta:** `src/common/exceptions/domain.exception.ts`

```typescript
export abstract class DomainException extends Error {
    readonly httpStatus?: number;
    readonly errorCode?: string;

    constructor(message: string, httpStatus?: number, errorCode?: string) {
        super(message);
        this.name = this.constructor.name;
        this.httpStatus = httpStatus;
        this.errorCode = errorCode;
        Error.captureStackTrace(this, this.constructor);
    }
}
```

---

## 2. exception-handler.interface.ts

**Ruta:** `src/common/filters/handlers/exception-handler.interface.ts`

```typescript
export interface ExceptionHandler {
    canHandle(exception: unknown): boolean;
    handle(exception: unknown): { status: number; message: string | string[]; errorCode?: string };
}
```

---

## 3. domain-exception.handler.ts

**Ruta:** `src/common/filters/handlers/domain-exception.handler.ts`

```typescript
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../exceptions/domain.exception';
import { ExceptionHandler } from './exception-handler.interface';

export class DomainExceptionHandler implements ExceptionHandler {
    canHandle(exception: unknown): boolean {
        return exception instanceof DomainException;
    }

    handle(exception: DomainException): { status: number; message: string; errorCode?: string } {
        return {
            status:    exception.httpStatus ?? HttpStatus.BAD_REQUEST,
            message:   exception.message,
            errorCode: exception.errorCode,
        };
    }
}
```

---

## 4. domain-exception.filter.ts

Solo se agrega `errorCode` al JSON de respuesta (omitido si es `undefined`).

**Ruta:** `src/common/filters/domain-exception.filter.ts`

```typescript
import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { LoggerService } from '../logger/logger.service';
import { ExceptionHandler } from './handlers/exception-handler.interface';
import { ThrottlerExceptionHandler } from './handlers/throttler-exception.handler';
import { DomainExceptionHandler } from './handlers/domain-exception.handler';
import { HttpExceptionHandler } from './handlers/http-exception.handler';
import { UnknownErrorHandler } from './handlers/unknown-error.handler';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
    private readonly handlers: ExceptionHandler[] = [
        new ThrottlerExceptionHandler(),
        new DomainExceptionHandler(),
        new HttpExceptionHandler(),
        new UnknownErrorHandler(),
    ];

    constructor(private readonly logger: LoggerService) {}

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx      = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request  = ctx.getRequest();

        const handler = this.handlers.find((h) => h.canHandle(exception));

        const { status, message, errorCode } = handler
            ? handler.handle(exception)
            : { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error', errorCode: undefined };

        const logMessage = `${request.method} ${request.url} - ${status} ${JSON.stringify(message)}`;

        if (status >= 500) {
            this.logger.error(logMessage, exception instanceof Error ? exception.stack : undefined, 'DomainExceptionFilter');
        } else {
            this.logger.warn(logMessage, 'DomainExceptionFilter');
        }

        response.status(status).json({
            statusCode: status,
            ...(errorCode !== undefined && { errorCode }),
            message,
            timestamp: new Date().toISOString(),
        });
    }
}
```

---

## 5. email-not-verified.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/email-not-verified.exception.ts`

```typescript
import { DomainException } from 'src/common/exceptions/domain.exception';

export class EmailNotVerifiedException extends DomainException {
    constructor() {
        super('Email address has not been verified', 403, 'EMAIL_NOT_VERIFIED');
    }
}
```

---

## 6. account-suspended.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/account-suspended.exception.ts`

```typescript
import { DomainException } from 'src/common/exceptions/domain.exception';

export class AccountSuspendedException extends DomainException {
    constructor() {
        super('Account has been suspended', 403, 'ACCOUNT_SUSPENDED');
    }
}
```

---

## 7. account-banned.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/account-banned.exception.ts`

```typescript
import { DomainException } from 'src/common/exceptions/domain.exception';

export class AccountBannedException extends DomainException {
    constructor() {
        super('Account has been banned', 403, 'ACCOUNT_BANNED');
    }
}
```

---

## 8. invalid-credentials.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/invalid-credentials.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidCredentialsException extends DomainException {
    constructor() {
        super('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }
}
```

---

## 9. user-already-exists.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/user-already-exists.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class UserAlreadyExistsException extends DomainException {
    constructor(email: string) {
        super(`User with email ${email} already exists`, 409, 'EMAIL_ALREADY_EXISTS');
    }
}
```

---

## 10. username-already-exists.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/username-already-exists.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class UsernameAlreadyExistsException extends DomainException {
    constructor(username: string) {
        super(`Username "${username}" is already taken`, 409, 'USERNAME_ALREADY_EXISTS');
    }
}
```

---

## 11. user-not-found.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/user-not-found.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class UserNotFoundException extends DomainException {
    constructor(email: string) {
        super(`User with email ${email} not found`, 404, 'USER_NOT_FOUND');
    }
}
```

---

## 12. verification-token-invalid.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/verification-token-invalid.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class VerificationTokenInvalidException extends DomainException {
    constructor() {
        super('Verification token is invalid or has already been used', 400, 'VERIFICATION_TOKEN_INVALID');
    }
}
```

---

## 13. verification-token-expired.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/verification-token-expired.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class VerificationTokenExpiredException extends DomainException {
    constructor() {
        super('Verification token has expired', 400, 'VERIFICATION_TOKEN_EXPIRED');
    }
}
```

---

## Orden de aplicación

1. Actualizar `domain.exception.ts` (base — primero siempre)
2. Actualizar `exception-handler.interface.ts`
3. Actualizar `domain-exception.handler.ts`
4. Actualizar `domain-exception.filter.ts`
5. Actualizar los 9 archivos de excepciones (el orden entre ellos no importa)

> Las excepciones de propuestas 08–11 aún no aplicadas (`EMAIL_ALREADY_VERIFIED`, `PROFILE_ALREADY_EXISTS`) ya incluyen `errorCode` en sus propuestas respectivas. No requieren cambio adicional.

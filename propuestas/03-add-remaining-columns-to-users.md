# Propuesta: Agregar campos restantes a tabla users

**Estado:** ✅ Completado — columnas presentes en la migración `1706140000000-CreateUsersTable.ts`.

Migración que agrega los 14 campos faltantes para completar el esquema de la tabla `users`.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/infrastructure/database/migrations/1782348943969-AddRemainingColumnsToUsers.ts` | Crear |

---

## 1. Migración AddRemainingColumnsToUsers

**Ruta:** `src/infrastructure/database/migrations/1782348943969-AddRemainingColumnsToUsers.ts`

```typescript
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRemainingColumnsToUsers1782348943969
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'username',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
      new TableColumn({
        name: 'last_name_1',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
      new TableColumn({
        name: 'last_name_2',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
      new TableColumn({
        name: 'avatar_url',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'birth_date',
        type: 'date',
        isNullable: true,
      }),
      new TableColumn({
        name: 'gender',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
      new TableColumn({
        name: 'country_code',
        type: 'varchar',
        length: '2',
        isNullable: true,
      }),
      new TableColumn({
        name: 'timezone',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
      new TableColumn({
        name: 'locale',
        type: 'varchar',
        length: '10',
        isNullable: true,
      }),
      new TableColumn({
        name: 'status',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
      new TableColumn({
        name: 'is_two_factor_enabled',
        type: 'boolean',
        isNullable: true,
        default: false,
      }),
      new TableColumn({
        name: 'two_factor_secret',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'last_login_at',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'deleted_at',
        type: 'timestamp',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('users', [
      'username',
      'last_name_1',
      'last_name_2',
      'avatar_url',
      'birth_date',
      'gender',
      'country_code',
      'timezone',
      'locale',
      'status',
      'is_two_factor_enabled',
      'two_factor_secret',
      'last_login_at',
      'deleted_at',
    ]);
  }
}
```

---

## Orden de aplicación

1. Crear el archivo de migración con el código anterior
2. Ejecutar: `pnpm run migration:run`
3. Verificar con: `pnpm run migration:show`

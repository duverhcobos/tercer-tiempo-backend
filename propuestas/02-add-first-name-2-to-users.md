# Propuesta: Agregar columna first_name_2 a users

Agrega el campo `first_name_2` (segundo nombre, opcional) a la tabla `users` mediante una migración de TypeORM.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/infrastructure/database/migrations/1782344859842-AddFirstName2ToUsers.ts` | Crear |

---

## 1. Migración AddFirstName2ToUsers

**Ruta:** `src/infrastructure/database/migrations/1782344859842-AddFirstName2ToUsers.ts`

```typescript
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddFirstName2ToUsers1782344859842 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'first_name_2',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'first_name_2');
  }
}
```

---

## Orden de aplicación

1. Crear el archivo de migración con el código anterior
2. Ejecutar: `pnpm run migration:run`
3. Verificar con: `pnpm run migration:show`

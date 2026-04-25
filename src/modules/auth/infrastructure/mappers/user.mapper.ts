import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { User } from '../../domain/entities/user.entity';

export class UserMapper {
    /**
     * Convierte un esquema de TypeORM a una entidad de dominio
     */
    static toDomain(schema: UserSchema): User {
        return new User(
            schema.id,
            schema.email,
            schema.password,
            schema.phone || null,
            schema.createdAt,
            schema.updatedAt,
        );
    }

    /**
     * Convierte una entidad de dominio a un esquema de TypeORM
     */
    static toSchema(user: User): UserSchema {
        const schema = new UserSchema();

        // Solo asignar ID si existe (para updates)
        if (user.id) {
            schema.id = user.id;
        }

        schema.email = user.email;
        schema.password = user.password;
        if (user.phone) {
            schema.phone = user.phone;
        }

        return schema;
    }

    /**
     * Convierte un array de esquemas a un array de entidades de dominio
     */
    static toDomainList(schemas: UserSchema[]): User[] {
        return schemas.map(schema => this.toDomain(schema));
    }
}

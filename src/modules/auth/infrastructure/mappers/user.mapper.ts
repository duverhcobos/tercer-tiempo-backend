import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { User } from '../../domain/entities/user.entity';

export class UserMapper {
  static toDomain(schema: UserSchema): User {
    return new User(
      schema.id,
      schema.email,
      schema.username,
      schema.passwordHash,
      schema.status,
      schema.createdAt,
      schema.updatedAt,
    );
  }

  static toSchema(user: User): UserSchema {
    const schema = new UserSchema();

    if (user.id) {
      schema.id = user.id;
    }

    schema.email = user.email;
    schema.username = user.username;
    schema.passwordHash = user.password!;

    return schema;
  }

  static toDomainList(schemas: UserSchema[]): User[] {
    return schemas.map((schema) => this.toDomain(schema));
  }
}
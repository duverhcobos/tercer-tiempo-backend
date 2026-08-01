// import { applyDecorators } from '@nestjs/common';
// import { ApiOperation, ApiResponse } from '@nestjs/swagger';
// import { AuthResponseSchema } from '../../application/swagger-schemas/auth-response.schema';

// export const ApiRegister = () =>
//     applyDecorators(
//         ApiOperation({
//             summary: 'Register a new user',
//             description:
//                 'Creates a new user account. The email must be unique.\n\n' +
//                 'The password must be at least 8 characters long and will be hashed with bcrypt before being stored.',
//         }),
//         ApiResponse({
//             status: 201,
//             description: 'User registered successfully',
//             type: AuthResponseSchema,
//         }),
//         ApiResponse({
//             status: 409,
//             description: 'Email is already registered',
//             schema: {
//                 example: {
//                     statusCode: 409,
//                     message: 'User with email user@example.com already exists',
//                     timestamp: '2026-01-24T20:50:00.000Z',
//                 },
//             },
//         }),
//         ApiResponse({
//             status: 400,
//             description: 'Invalid input data',
//             schema: {
//                 example: {
//                     statusCode: 400,
//                     message: ['Invalid email address', 'Password must be at least 8 characters long'],
//                     timestamp: '2026-01-24T20:50:00.000Z',
//                 },
//             },
//         }),
//     );

// export const ApiLogin = () =>
//     applyDecorators(
//         ApiOperation({
//             summary: 'Sign in',
//             description:
//                 'Authenticates an existing user with email and password.\n\n' +
//                 'Returns a JWT token that must be included in the Authorization header as a Bearer token.',
//         }),
//         ApiResponse({
//             status: 200,
//             description: 'Login successful',
//             type: AuthResponseSchema,
//         }),
//         ApiResponse({
//             status: 401,
//             description: 'Invalid credentials',
//             schema: {
//                 example: {
//                     statusCode: 401,
//                     message: 'Invalid credentials',
//                     timestamp: '2026-01-24T20:50:00.000Z',
//                 },
//             },
//         }),
//         ApiResponse({
//             status: 400,
//             description: 'Invalid input data',
//             schema: {
//                 example: {
//                     statusCode: 400,
//                     message: ['Invalid email address', 'Password is required'],
//                     timestamp: '2026-01-24T20:50:00.000Z',
//                 },
//             },
//         }),
//     );

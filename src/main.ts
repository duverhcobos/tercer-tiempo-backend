import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { LoggerService } from './common/logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Custom logger
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // Security — Helmet.js
  app.use(helmet());

  // CORS — configure allowed origins via CORS_ORIGIN env var
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Compression — improves response performance
  app.use(compression());

  // Global DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('NestJS DDD Template API')
    .setDescription('REST API built with NestJS following Domain-Driven Design (DDD) architecture')
    .setVersion('1.0')
    .addTag('auth', 'Authentication endpoints')
    .addTag('health', 'Health checks and monitoring')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter your JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 Application running at: http://localhost:${port}`, 'Bootstrap');
  logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`, 'Bootstrap');
  logger.log(`❤️  Health check: http://localhost:${port}/health`, 'Bootstrap');
}
bootstrap();

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/** Mounted here and printed on boot, so the two can't drift apart. */
const SWAGGER_PATH = 'api/docs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pharmacy Management System API')
    .setDescription(
      'Backend API for the Pharmacy Management System. Authenticate via ' +
        '`POST /auth/login`, then use "Authorize" to send the token on protected routes.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    SWAGGER_PATH,
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = app.get(ConfigService).getOrThrow<number>('port');
  await app.listen(port);

  // Logged after listen() resolves, so the port printed is one the server has
  // actually bound — not one it was merely asked for.
  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}`);
  logger.log(`Swagger UI at http://localhost:${port}/${SWAGGER_PATH}`);
}

void bootstrap();

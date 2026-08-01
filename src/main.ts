import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import * as Sentry from "@sentry/nestjs";
import redoc from "redoc-express";
import helmet from "helmet";
import { AppModule } from "@src/app.module";

async function bootstrap() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENV || "localhost",
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.set("json spaces", 2);

  if (process.env.SWAGGER_PREFIX) {
    const config = new DocumentBuilder()
      .setTitle(process.env.SWAGGER_TITLE || "Event Server API")
      .setDescription(
        process.env.SWAGGER_DESCRIPTION || "Central event broker",
      )
      .setVersion(process.env.SWAGGER_VERSION || "1.0")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(process.env.SWAGGER_PREFIX, app, document);
  }

  if (process.env.SWAGGER_PREFIX_REDOC) {
    const redocConfig = {
      title: process.env.SWAGGER_TITLE || "Event Server API",
      version: process.env.SWAGGER_VERSION || "1.0",
      specUrl: `${process.env.SWAGGER_PREFIX}-json`,
    };
    app.use(`${process.env.SWAGGER_PREFIX_REDOC}`, redoc(redocConfig));
  }

  const port = process.env.PORT || 3005;
  const ip = process.env.IP || "localhost";
  const logger = new Logger("Bootstrap");

  await app.listen(port, ip);
  logger.log(
    `Event server running in ${process.env.NODE_ENV || "development"} mode on port ${port} at http://${ip}:${port}`,
  );

  process.on("SIGINT", () => {
    app.close();
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start event server:", err);
  process.exit(1);
});

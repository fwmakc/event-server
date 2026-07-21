import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "@src/app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: console,
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true }));
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

  const port = process.env.PORT || 3005;
  const ip = process.env.IP || "localhost";

  await app.listen(port, ip).then(() => {
    console.log(
      `Event server running\nin ${process.env.NODE_ENV || "development"} mode\non port ${port}\nat http://${ip}:${port}`,
    );
  });

  process.on("SIGINT", () => {
    app.close();
  });
}

bootstrap();

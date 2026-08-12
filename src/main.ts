import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { bootstrap } from "api-server-toolkit/bootstrap";
import { Sentry, Helmet, ValidationPipe, Log, Prefix } from "api-server-toolkit/bootstrap/setup";
import { AppModule } from "@src/app.module";

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  Sentry.setup(app);
  Helmet.setup(app);
  ValidationPipe.setup(app);
  Log.setup(app);
  Prefix.setup(app);

  app.set("json spaces", 2);

  await bootstrap(app, { port: 3005 });
}

main();

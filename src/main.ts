import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { bootstrap } from "api-server-toolkit/bootstrap";
import { Sentry, Helmet, Morgan, ValidationPipe, Log, Prefix } from "api-server-toolkit/bootstrap/setup";
import { AppModule } from "@src/app.module";

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  Sentry.setup(app);
  Helmet.setup(app);
  // Log.setup first: it installs the request-id middleware morgan reads from
  Log.setup(app);
  Morgan.setup(app);
  ValidationPipe.setup(app);
  Prefix.setup(app);

  app.set("json spaces", 2);

  await bootstrap(app, { port: 3005 });
}

main();

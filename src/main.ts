import { bootstrap } from "api-server-toolkit/bootstrap";
import { AppModule } from "@src/app.module";

bootstrap({
  module: AppModule,
  serviceName: "event-server",
  cors: false,
  beforeListen: (app) => {
    app.set("json spaces", 2);
  },
});

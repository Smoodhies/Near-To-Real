import { Config } from "../../config/config.js";
import { createApiServer } from "./server.js";

const config = new Config().validate();

const app = createApiServer({
  config,
});

try {
  await app.listen({
    host: config.api.host,
    port: config.api.port,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

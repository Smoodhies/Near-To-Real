import { Config } from "../../config/config.js";
import { createApiServer } from "./server.js";
import healthRoutes from "./healthRoutes.js";
import { mediaRoutes } from "./mediaRoutes.js"; "./mediaRoutes.js";

export default async function routes(fastify) {
  await fastify.register(healthRoutes);
  await fastify.register(mediaRoutes);
}

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

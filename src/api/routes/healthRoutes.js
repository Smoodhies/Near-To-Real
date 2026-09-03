export default async function healthRoutes(fastify) {
  fastify.get("/health", async () => {
    return {
      success: true,
      status: "ok",
      service: "n2r_mediaprocessing",
      timestamp: new Date().toISOString(),
    };
  });
}

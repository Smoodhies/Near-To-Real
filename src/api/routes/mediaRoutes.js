import { ProcessingJob } from "../../worker/processingJob.js";

import { createMediaJobSchema } from "../schemas/mediaJobSchema.js";

export async function mediaRoutes(fastify, { queue }) {
  fastify.post(
    "/media/jobs",
    {
      schema: createMediaJobSchema,
    },

    async (request, reply) => {
      const { source, options, metadata } = request.body;

      if (source.type === "s3" && (!source.bucket || !source.key)) {
        return reply.code(400).send({
          error: "S3 source requires bucket and key",
        });
      }

      if (source.type === "local" && !source.path) {
        return reply.code(400).send({
          error: "Local source requires path",
        });
      }

      const job = new ProcessingJob({
        source,
        options,
        metadata,
      });

      const queued = await queue.enqueue(job);

      return reply.code(202).send({
        jobId: job.jobId,

        status: "QUEUED",

        messageId: queued.messageId,
      });
    }
  );
}

export const createMediaJobSchema = {
  body: {
    type: "object",

    additionalProperties: false,

    required: ["source"],

    properties: {
      source: {
        type: "object",

        additionalProperties: false,

        required: ["type"],

        properties: {
          type: {
            type: "string",

            enum: ["local", "s3"],
          },

          path: {
            type: "string",

            minLength: 1,

            maxLength: 2048,
          },

          bucket: {
            type: "string",

            minLength: 3,

            maxLength: 255,
          },

          key: {
            type: "string",

            minLength: 1,

            maxLength: 1024,
          },
        },
      },

      options: {
        type: "object",

        additionalProperties: false,

        properties: {
          generateWav: {
            type: "boolean",
          },

          generateMp3: {
            type: "boolean",
          },

          generateVideoOnly: {
            type: "boolean",
          },

          extractSubtitles: {
            type: "boolean",
          },
        },
      },

      metadata: {
        type: "object",

        additionalProperties: true,
      },
    },
  },
};

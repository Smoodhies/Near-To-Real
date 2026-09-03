export const createMediaJobSchema = {
  body: {
    type: "object",

    additionalProperties: false,

    required: ["assetId"],

    properties: {
      assetId: {
        type: "string",

        minLength: 1,

        maxLength: 128,
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

import Busboy from "busboy";

import ApiErrorObject from "../utils/ApiError.js";

const MAX_VIDEO_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 2 * 1024 * 1024 * 1024; // 2 GB

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);

const ParseVideoUpload = (req, { onFile }) => {
  return new Promise((resolve, reject) => {
    let busboy;

    let fileReceived = false;
    let fileTooLarge = false;
    let uploadPromise = null;

    let settled = false;

    const rejectOnce = (error) => {
      if (settled) return;

      settled = true;
      reject(error);
    };

    const resolveOnce = (data) => {
      if (settled) return;

      settled = true;
      resolve(data);
    };

    /*
     * Validate multipart request
     */
    const contentType = req.headers["content-type"];

    if (!contentType || !contentType.startsWith("multipart/form-data")) {
      rejectOnce(
        ApiErrorObject.SendError({
          statusCode: 400,
          message: "Request must use multipart/form-data",
        })
      );

      return;
    }

    /*
     * Create Busboy
     */
    try {
      busboy = Busboy({
        headers: req.headers,

        limits: {
          files: 1,
          fileSize: MAX_VIDEO_SIZE,
          fields: 10,
        },
      });
    } catch (error) {
      rejectOnce(
        ApiErrorObject.SendError({
          statusCode: 400,
          message: "Invalid multipart request",
          errors: [
            {
              originalMessage: error?.message,
            },
          ],
        })
      );

      return;
    }

    /*
     * FILE EVENT
     *
     * This is the important part.
     *
     * We start consuming/uploading the stream
     * immediately.
     */
    busboy.on("file", (fieldName, fileStream, info) => {
      const { filename, mimeType } = info;

      console.log("File received:", filename, mimeType);

      /*
       * Only accept:
       *
       * file=<video>
       */
      if (fieldName !== "file") {
        fileStream.resume();

        rejectOnce(
          ApiErrorObject.SendError({
            statusCode: 400,
            message: 'Upload field must be named "file"',
          })
        );

        return;
      }

      /*
       * Only one file
       */
      if (fileReceived) {
        fileStream.resume();

        rejectOnce(
          ApiErrorObject.SendError({
            statusCode: 400,
            message: "Only one file is allowed",
          })
        );

        return;
      }

      fileReceived = true;

      /*
       * Validate MIME type
       */
      if (!ALLOWED_VIDEO_TYPES.has(mimeType)) {
        fileStream.resume();

        rejectOnce(
          ApiErrorObject.SendError({
            statusCode: 415,
            message: "Unsupported video type",
            errors: [
              {
                received: mimeType,
                allowed: [...ALLOWED_VIDEO_TYPES],
              },
            ],
          })
        );

        return;
      }

      /*
       * Detect size limit
       */
      fileStream.on("limit", () => {
        fileTooLarge = true;
      });

      /*
       * START S3 UPLOAD IMMEDIATELY
       *
       * Do NOT wait for busboy finish.
       */
      uploadPromise = onFile({
        stream: fileStream,
        originalName: filename,
        contentType: mimeType,
      }).catch((error) => {
        rejectOnce(error);

        /*
         * Important:
         * consume remaining request data
         * if upload fails.
         */
        fileStream.resume();

        throw error;
      });
    });

    /*
     * Busboy finished parsing the multipart body.
     */
    busboy.on("finish", async () => {
      try {
        if (fileTooLarge) {
          rejectOnce(
            ApiErrorObject.SendError({
              statusCode: 413,
              message: "Video exceeds the maximum allowed size of 2 GB",
            })
          );

          return;
        }

        if (!fileReceived) {
          rejectOnce(
            ApiErrorObject.SendError({
              statusCode: 400,
              message: "No video file was uploaded",
            })
          );

          return;
        }

        /*
         * VERY IMPORTANT:
         *
         * Wait for S3 upload to finish.
         */
        const uploadResult = await uploadPromise;

        resolveOnce({
          ...uploadResult,
        });
      } catch (error) {
        rejectOnce(error);
      }
    });

    /*
     * Busboy error
     */
    busboy.on("error", (error) => {
      rejectOnce(
        ApiErrorObject.SendError({
          statusCode: 400,
          message: "Failed to parse multipart upload",
          errors: [
            {
              originalMessage: error?.message,
            },
          ],
        })
      );
    });

    /*
     * Start consuming HTTP request.
     */
    req.pipe(busboy);
  });
};

export default ParseVideoUpload;

import ApiErrorObject from "./ApiError.js";
// import ApiresponseObject from "./ApiRespone.js";


const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

export const validateVideoUpload = ({ fileName, contentType, fileSize }) => {
  if (!fileName) {
    throw ApiErrorObject.SendError({
      statusCode: 400,
      message: "File name is required",
    });
  }

  if (!contentType) {
    throw ApiErrorObject.SendError({
      statusCode: 400,
      message: "File content type is required",
    });
  }

  if (!ALLOWED_VIDEO_TYPES.has(contentType)) {
    throw ApiErrorObject.SendError({
      statusCode: 415,
      message: `Unsupported video type: ${contentType}`,
      errors: [
        {
          field: "contentType",
          allowedTypes: [...ALLOWED_VIDEO_TYPES],
        },
      ],
    });
  }

  if (fileSize !== undefined && fileSize !== null && fileSize > MAX_FILE_SIZE) {
    throw ApiErrorObject.SendError({
      statusCode: 413,
      message: "Video file is too large",
      errors: [
        {
          field: "fileSize",
          maximumBytes: MAX_FILE_SIZE,
        },
      ],
    });
  }

  return true;
};

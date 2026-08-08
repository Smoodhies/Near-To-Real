export const API_ERROR = {
  CLIENT: {
    BAD_REQUEST: {
      statusCode: 400,
      success: false,
      message: "Bad Request",
    },

    VALIDATION_FAILED: {
      statusCode: 422,
      success: false,
      message: "Validation Failed",
    },

    NOT_FOUND: {
      statusCode: 404,
      success: false,
      message: "Resource Not Found",
    },

    METHOD_NOT_ALLOWED: {
      statusCode: 405,
      success: false,
      message: "Method Not Allowed",
    },

    CONFLICT: {
      statusCode: 409,
      success: false,
      message: "Resource Already Exists",
    },

    TOO_MANY_REQUESTS: {
      statusCode: 429,
      success: false,
      message: "Too Many Requests",
    },
  },

  AUTH: {
    UNAUTHORIZED: {
      statusCode: 401,
      success: false,
      message: "Unauthorized",
    },

    INVALID_TOKEN: {
      statusCode: 401,
      success: false,
      message: "Invalid Token",
    },

    TOKEN_EXPIRED: {
      statusCode: 401,
      success: false,
      message: "Token Expired",
    },

    FORBIDDEN: {
      statusCode: 403,
      success: false,
      message: "Access Denied",
    },
  },

  USER: {
    USER_NOT_FOUND: {
      statusCode: 404,
      success: false,
      message: "User Not Found",
    },

    ALREADY_EXISTS: {
      statusCode: 409,
      success: false,
      message: "User Already Exists with this email or username ",
    },

    INVALID_CREDENTIALS: {
      statusCode: 401,
      success: false,
      message: "Invalid Email or Password",
    },
  },

  FILE: {
    FILE_TOO_LARGE: {
      statusCode: 413,
      success: false,
      message: "File Too Large",
    },

    INVALID_FILE_TYPE: {
      statusCode: 415,
      success: false,
      message: "Unsupported File Type",
    },

    Upload_Failed: {
      statusCode: 500,
      success: false,
      message: "Failed at Upload",
    },
  },

  SERVER: {
    INTERNAL_SERVER_ERROR: {
      statusCode: 500,
      success: false,
      message: "Internal Server Error",
    },

    DATABASE_ERROR: {
      statusCode: 500,
      success: false,
      message: "Database Error",
    },

    SERVICE_UNAVAILABLE: {
      statusCode: 503,
      success: false,
      message: "Service Unavailable",
    },

    GATEWAY_TIMEOUT: {
      statusCode: 504,
      success: false,
      message: "Gateway Timeout",
    },
  },
};

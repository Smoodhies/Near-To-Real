export const API_RESPONSE = {
  SUCCESS: {
    DATABASE: {
      CONNECTED: {
        statusCode: 200,
        success: true,
        message: "Database connected successfully.",
      },

      DISCONNECTED: {
        statusCode: 200,
        success: true,
        message: "Database disconnected successfully.",
      },

      RECONNECTED: {
        statusCode: 200,
        success: true,
        message: "Database reconnected successfully.",
      },
    },
    FETCH: {
      statusCode: 200,
      success: true,
      message: "Data fetched successfully",
    },

    CREATE: {
      statusCode: 201,
      success: true,
      message: "Resource created successfully",
    },

    UPDATE: {
      statusCode: 200,
      success: true,
      message: "Resource updated successfully",
    },

    DELETE: {
      statusCode: 200,
      success: true,
      message: "Resource deleted successfully",
    },

    LOGIN: {
      statusCode: 200,
      success: true,
      message: "Login successful",
    },

    LOGOUT: {
      statusCode: 200,
      success: true,
      message: "Logout successful",
    },

    REGISTER: {
      statusCode: 201,
      success: true,
      message: "Registration successful",
    },

    EMAIL_SENT: {
      statusCode: 200,
      success: true,
      message: "Email sent successfully",
    },

    FILE_UPLOADED: {
      statusCode: 201,
      success: true,
      message: "File uploaded successfully",
    },
  },
};

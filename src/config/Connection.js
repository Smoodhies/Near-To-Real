import mongoose from "mongoose";

import ApiErrorObject from "../utils/ApiError.js";
import { API_ERROR } from "../constants/ApiErrorBible.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";

async function DB_Connection() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    const databaseName = process.env.MONGODB_DB_NAME;

    if (!mongoUri) {
      throw new Error("MONGODB_URI is required");
    }

    if (!databaseName) {
      throw new Error("MONGODB_DB_NAME is required");
    }

    const DB_Instance = await mongoose.connect(mongoUri, {
      dbName: databaseName,
    });

    console.log("Backend MongoDB connected:", {
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      database: mongoose.connection.name,
    });

    if (DB_Instance) {
      console.log({
        ...API_RESPONSE.SUCCESS.DATABASE.CONNECTED,
      });
    }

    return DB_Instance;
  } catch (error) {
    console.error("MongoDB connection failed:", error);

    ApiErrorObject.SendError({
      ...API_ERROR.SERVER.DATABASE_ERROR,
    });

    process.exit(1);
  }
}

export default DB_Connection;

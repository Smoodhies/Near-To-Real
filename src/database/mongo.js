import mongoose from "mongoose";

let connectingPromise = null;

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  connectingPromise = mongoose
    .connect(uri, {
      dbName: process.env.MONGODB_DB_NAME || undefined,

      /*
       * Fail fast when MongoDB cannot be reached.
       *
       * This prevents the API from sitting in
       * Fastify startup indefinitely.
       */

      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS ?? 10000),

      connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS ?? 10000),

      socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS ?? 45000),

      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE ?? 20),

      minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE ?? 2),

      maxIdleTimeMS: Number(process.env.MONGODB_MAX_IDLE_TIME_MS ?? 60000),
    })
    .then(() => {
      console.log("MongoDB connected");

      return mongoose.connection;
    })
    .catch((error) => {
      console.error("MongoDB connection failed:", error.message);

      throw error;
    })
    .finally(() => {
      connectingPromise = null;
    });

  return connectingPromise;
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  console.log("MongoDB disconnected");
}

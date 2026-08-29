import mongoose from "mongoose";

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME || undefined,
  });

  console.log("MongoDB connected");

  return mongoose.connection;
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  console.log("MongoDB disconnected");
}

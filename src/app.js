import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import DB_Connection from "./config/Connection.js";

const app = express();

const Cors_Options = {
  origin: process.env.CORS_ORIGIN,
  credentials: true,
};

// cors middleware
app.use(cors(Cors_Options));

// cookie parser middleware
app.use(cookieParser());

// body parser middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static("public"));

// DB Connections
DB_Connection().then(
  app.listen(process.env.PORT || 8080, () => {
    console.log(`❗Server is running on port ${process.env.PORT} ❗`);
  })
);


import userRoute from "./routes/user.routes.js"

app.use("/user", userRoute);

export { app };

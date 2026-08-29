import dotenv from "dotenv";

dotenv.config({
  path: "./.env",
});

import { app } from "./app.js";
import DB_Connection from "./config/Connection.js";

await DB_Connection();

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

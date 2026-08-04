import mongoose from "mongoose";
import ApiErrorObject from "../utils/ApiError.js";
import ApiresponseObject from "../utils/ApiRespone.js";
import { API_ERROR } from "../constants/ApiErrorBible.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";
async function DB_Connection() {
  try {
    const DB_Instance = await mongoose.connect(process.env?.MONGODB_URI);

    if(DB_Instance){
      console.log({...API_RESPONSE.SUCCESS.DATABASE.CONNECTED})
    }
    return DB_Instance;
  } catch (error) {
    console.log("Connection not Establish with Db", error);
    ApiErrorObject.SendError({
      ...API_ERROR.SERVER.DATABASE_ERROR
    });

    process.exit(1);
  }
}

export default DB_Connection;

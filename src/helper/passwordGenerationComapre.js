import { API_ERROR } from "../constants/ApiErrorBible.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";
import User from "../models/user.modelController.js";
import ApiErrorObject from "../utils/ApiError.js";
import ApiresponseObject from "../utils/ApiRespone.js";
import AsyncFunctionHandler from "../utils/AsyncHandler.js";

const comparePassword = async (plainPassword) => {
  console.log(plainPassword, "plainPassword");
  const ispasswordCorrect = User.isPasswordCorrect(plainPassword);
  console.log(ispasswordCorrect, "ispasswordCorrect");

  if (!ispasswordCorrect) {
    throw ApiErrorObject.SendError({ ...API_ERROR.AUTH.FORBIDDEN, message: "Invalid password" });
  }

  return ApiresponseObject.SendResponse({
    ...API_RESPONSE.SUCCESS.FETCH,
    message: "Password is correct",
  });
};

export default comparePassword;

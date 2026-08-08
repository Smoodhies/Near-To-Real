import jwt from "jsonwebtoken";
import { API_ERROR } from "../constants/ApiErrorBible.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";
import User from "../models/user.modelController.js";
import ApiErrorObject from "../utils/ApiError.js";
import ApiresponseObject from "../utils/ApiRespone.js";
import cookieParser from "cookie-parser";

const generateAccessAndRefreshTokens = async (userid) => {
  const user = await User.findOne({ _id: userid });

  if (!user) {
    throw ApiErrorObject.SendError({
      ...API_ERROR.AUTH.FORBIDDEN,
      message: "User not found",
    });
  }

  const accessToken = await user.generateAccessToken();
  const refreshToken = await user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  console.log("refreshToken in generateAccessAndRefreshTokens", user.refreshToken);

  return { accessToken, refreshToken };
};

export default generateAccessAndRefreshTokens;

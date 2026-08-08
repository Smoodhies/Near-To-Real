// jwt verify middleware
import jwt from "jsonwebtoken";
import ApiErrorObject from "../utils/ApiError.js";
import ApiresponseObject from "../utils/ApiRespone.js";
import AsyncFunctionHandler from "../utils/AsyncHandler.js";
import User from "../models/user.modelController.js";
import { API_ERROR } from "../constants/ApiErrorBible.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";

const verifyToken = AsyncFunctionHandler(async (req, resp, next) => {
    try {
        const token = req.cookies?.accessToken || req.headers.authorization?.replace("Bearer ", "");
        if (!token) {
            throw ApiErrorObject.SendError({ ...API_ERROR.AUTH.FORBIDDEN, message: "You Are not logged in" });
        }
        const decodedToken = await jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken");
        if (!user) {
            throw ApiErrorObject.SendError({ ...API_ERROR.AUTH.FORBIDDEN, message: "User not found" });
        }
        req.user = user;
        console.log("user from verifyToken middleware", req.user);
        next();
    } catch (error) {
        console.error("Error in verifyToken middleware:", error);
        throw ApiErrorObject.SendError({ ...API_ERROR.AUTH.FORBIDDEN, message: "Invalid token" });
    }
} 
)

export default verifyToken;
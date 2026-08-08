import { API_ERROR } from "../constants/ApiErrorBible.js";
import User from "../models/user.modelController.js";
import ApiErrorObject from "../utils/ApiError.js";
import ApiresponseObject from "../utils/ApiRespone.js";
import AsyncFunctionHandler from "../utils/AsyncHandler.js";
import generateAccessAndRefreshTokens from "../helper/accessRefreshtokenGeneration.js";
import comparePassword from "../helper/passwordGenerationComapre.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";

/*
logout logic 

find user by id and then 
clear  sesssion and cookie and then send response to user that user is logged out successfully 





*/

const registerUser = AsyncFunctionHandler(async (req, resp) => {
  const { email, password, username, fullName } = await req.body;

  if (
    [fullName, email, username, password].some(
      (field) => field?.trim() === "" || field === undefined
    )
  ) {
    throw ApiErrorObject.SendError({ ...API_ERROR.USER.INVALID_CREDENTIALS });
  }

  // existedUser = await User.find({ email: email, username: username });
  const existedUser = await User.findOne({
    $or: [{ email: email }, { username: username }],
  });

  if (existedUser) {
    throw ApiErrorObject.SendError({ ...API_ERROR.USER.ALREADY_EXISTS });
  }

  const newuser = await User.create({
    username: username,
    email: email,
    password: password,
    fullName: fullName,
  });

  // await newuser?.save();

  const createdUser = await User.findOne({ _id: newuser._id }).select("-password -refreshToken");

  if (!createdUser) {
    throw ApiErrorObject.SendError({
      ...API_ERROR.USER.USER_NOT_FOUND,
      message: "User not created ",
    });
  }

  if (createdUser) {
    resp.send(
      ApiresponseObject.SendResponse({
        ...API_RESPONSE.SUCCESS.REGISTER,
        data: createdUser,
      })
    );
  }
});

//                                   ❗❗ login user❗❗

const loginUser = AsyncFunctionHandler(async (req, resp) => {
  const { username, email, password } = await req.body;

  if (!(username || email || password)) {
    throw ApiErrorObject.SendError({ ...API_ERROR.USER.INVALID_CREDENTIALS });
  }

  const user = await User.findOne({
    $or: [{ email: email }, { username: username }],
  });

  
  if (!user) {
    throw ApiErrorObject.SendError({ ...API_ERROR.USER.USER_NOT_FOUND });
  }
  
  const isPasswordValid = await user.isPasswordCorrect(password);
  
  if (!isPasswordValid) {
    throw ApiErrorObject.SendError({ ...API_ERROR.USER.INVALID_CREDENTIALS });
  }
  
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
  console.log("accessToken, refreshToken", accessToken, refreshToken);

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

  const options = {
    httpOnly: true,
    secure: true,
  };

  resp
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      ApiresponseObject.SendResponse({
        ...API_RESPONSE.SUCCESS.LOGIN,
        data: loggedInUser,
      })
    );
});

const logoutUser = async (req, res) => {
  const userId = req.user._id;
  console.log("userid ", userId);

  // Clear the refresh token from the database
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $unset: { refreshToken: 1 } },
    { new: true }
  );

  if (!updatedUser) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

export { registerUser, loginUser, logoutUser };

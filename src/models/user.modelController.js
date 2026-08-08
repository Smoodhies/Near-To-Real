import { mongoose, model, Schema, Mongoose } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import ApiErrorObject from "../utils/ApiError.js";
import ApiresponseObject from "../utils/ApiRespone.js";
import { API_ERROR } from "../constants/ApiErrorBible.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      min: [3, "Username is too short "],
      index: true,
      trim: true,
      tolowercase: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    fullName: {
      type: String,
      required: true,
      min: [3, "FullName is too short "],
      index: true,
      trim: true,
      tolowercase: true,
    },
    // Avatar: {
    //   type: String, // aws img url
    //   required: true,
    // },
    // CoverImage: {
    //   type: String, // aws img url
    //   required: true,
    // },

    password: {
      type: String,
      require: true,
      min: [8, "Password is too short "],
    },
    refreshToken: {
      type: String,
    },

    watchHistory: {
      type: Schema.Types.ObjectId,
      ref: "Video",
    },
  },
  {
    timestamps: true,
  }
);

/*
📝📝📝📝 note this  
if you're using Mongoose 9, this is no longer valid. Mongoose 9 removed the next() callback from pre middleware. You should use an async function / Promise instead. Mongoose
So Mongoose isn't giving your function the next callback you expect. Then this:
next()
becomes:
TypeError: next is not a function
That's exactly the error you're seeing.


sample code 

❗❗❗

userSchema.pre("save", function (next) {
  const user = this;
  if (!user.isModified("password")) return next();

  bcrypt
    .hash(user.password, 10)
    .then((hash) => {
      user.password = hash;
      next();
    })
    .catch((err) => next(err));
});

❗❗❗❗❗

*/

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  await bcrypt.hash(this.password, process.env.JWT_ROUND).then((hash) => {
    this.password = hash;
  });
});

userSchema.methods.isPasswordCorrect = async function (password) {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (error) {
    throw ApiErrorObject.SendError({
      ...API_ERROR.SERVER.INTERNAL_SERVER_ERROR,
    });
  }
};

userSchema.methods.generateRefreshToken = async function () {
  try {
    return await jwt.sign(
      {
        _id: this?._id,
      },
      process.env?.REFRESH_TOKEN_SECRET,
      {
        expiresIn: process.env?.REFRESH_TOKEN_EXPIRY,
      }
    );
  } catch (error) {
    throw ApiErrorObject.SendError({
      ...API_ERROR.SERVER.INTERNAL_SERVER_ERROR,
    });
  }
};

userSchema.methods.generateAccessToken = async function () {
  try {
    return await jwt.sign(
      {
        _id: this?._id,
        Email: this?.Email,
        Username: this.Username,
      },
      process.env?.ACCESS_TOKEN_SECRET,
      {
        expiresIn: process.env?.ACCESS_TOKEN_EXPIRY,
      }
    );
  } catch (error) {
    throw ApiErrorObject.SendError({
      ...API_ERROR.SERVER.INTERNAL_SERVER_ERROR,
    });
  }
};

const User = model("User", userSchema);

export default User;

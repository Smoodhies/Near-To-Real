import {mongoose , model , Schema} from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import ApiErrorObject from "../utils/ApiError.js";
import ApiresponseObject from "../utils/ApiRespone.js";
import { API_ERROR } from "../constants/ApiErrorBible.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";


const userSchema = new Schema(
  {
    Username: {
      type: String,
      required: true,
      unique: true,
      min: [3, "Username is too short "],
      index: true,
    },
    Email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    FullName: {
      type: String,
      required: true,
      unique: true,
      min: [3, "FullName is too short "],
      index: true,
      trim: true,
    },
    Avatar: {
      type: String, // aws img url
      required: true,
    },
    CoverImage: {
      type: String, // aws img url
      required: true,
    },
    password: {
      type: String,
      require: true,
      min: [8, "Password is too short "],
    },
    RefreshToken:{
        type:String,

    },

    WatchHistory:{
        type : Schema.Types.ObjectId,
        ref:"Video"
    }
    
  },
  {
    timestamps: true,
  }
);



userSchema.pre("save",async function(next){
    if ( !this.isModified("password")) {
        return( next() )
    }
    return(
        this.password = await bcrypt.hash(this.password, 10)
    );

})

userSchema.methods.isPasswordCorrect = async function (password) {
   try {
    await bcrypt.compare(password,this.password)
   } catch (error) {
    throw ApiErrorObject.SendError(
    {
      
    }
    )
   }
}

userSchema.methods.generateRefreshToken = async function(){
    try {
       return( await jwt.sign(
         {
           _id: this?._id,
         },
         process.env?.REFRESH_TOKEN_SECRET,
         {
           expiresIn: process.env?.REFRESH_TOKEN_EXPIRY,
         }
       ))
    } catch (error) {
       throw ApiErrorObject.SendError(
       {
       ...API_ERROR.SERVER.INTERNAL_SERVER_ERROR
       }
    );
    }
}


userSchema.methods.generateAccessToken = async function () {
  try {
    return( 
        await jwt.sign(
      {
        _id: this?._id,
        Email: this?.Email,
        Username: this.Username,
      },
      process.env?.ACCESS_TOKEN_SECRET,
      {
        expiresIn: process.env?.ACCESS_TOKEN_EXPIRY,
      }
    )
)

  } catch (error) {
    throw ApiErrorObject.SendError(
  {
      ...API_ERROR.SERVER.INTERNAL_SERVER_ERROR
    }
  );
  }
};




const User = models("User") || model("User", userSchema);


export default User;


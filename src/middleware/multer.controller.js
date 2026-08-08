import multer from "multer";
import AsyncFunctionHandler from "../utils/AsyncHandler.js";
import ApiErrorObject from "../utils/ApiError.js";
import ApiresponseObject from "../utils/ApiRespone.js";
import { API_ERROR } from "../constants/ApiErrorBible.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";
import fs from "fs";

// store afile temp in our server and then if save unlink and remove files from server in bot case success and failed

const uploadDir = "./src/Public/temp";

const storage = AsyncFunctionHandler(

  multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(uploadDir)) {
        return cb(
          ApiErrorObject.SendError({
            statusCode: 500,
            message: "Upload folder is missing",
          })
        );
      }

      cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
      // cb(null, file.originalname);
      if (!file.originalname) {
        ApiErrorObject.SendError({
          ...API_ERROR.FILE.Upload_Failed,
        });
      }
      cb(null, file.originalname);

      if (file.originalname) {
        ApiresponseObject.SendResponse({
          ...API_RESPONSE.SUCCESS.FILE_UPLOADED,
        });
      }
    },
  })
);

const upload = multer({ storage: storage });

export default upload;

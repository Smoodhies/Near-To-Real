import multer from "multer";
import AsyncFunctionHandler from "../utils/AsyncHandler";
import ApiErrorObject from "../utils/ApiError";
import ApiresponseObject from "../utils/ApiRespone";

//store a file temp in our server and then if save unlink and remove files from server in bot case success and failed

const storage = AsyncFunctionHandler(
  file = await multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "/public/");
    },
    filename: function (req, file, cb) {
      cb(null, file.fieldname);
    },
  })
);

const upload = multer({ storage: storage });

export default Upload;

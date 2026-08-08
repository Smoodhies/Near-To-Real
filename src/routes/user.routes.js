import { Router } from "express";
import upload from "../middleware/multer.controller.js";
import ApiErrorObject from "../utils/ApiError.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";
import ApiresponseObject from "../utils/ApiRespone.js";
import { registerUser, loginUser, logoutUser } from "../controllers/user.controller.js";
import verifyToken from "../middleware/auth.controller.js";

const router = Router();

// have to work of multer upload file function is not written yet
router.route("/upload").post(
  upload.fields([
    {
      name: "Avatar",
      maxCount: 1,
    },
    {
      name: "CoverImage",
      maxCount: 1,
    },
  ])
);

router.route("/register").post(registerUser);
router.route("/login").post(loginUser);


// verfyToken middleware is used to verify the token before allowing the user to logout or already logged in users
router.route("/logout").post(verifyToken, logoutUser);
  
// router.route("/login").get((req, resp , next) => {
//   resp.send(ApiresponseObject.SendResponse({ ...API_RESPONSE.SUCCESS.FETCH }));
// });

router.route("/home").get((req, resp, next) => {
  resp.send(ApiresponseObject.SendResponse({ ...API_RESPONSE.SUCCESS.FETCH }));
});

export default router;

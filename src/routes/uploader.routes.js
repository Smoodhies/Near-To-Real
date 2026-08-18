import { Router } from "express";
import ApiErrorObject from "../utils/ApiError.js";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";
import ApiresponseObject from "../utils/ApiRespone.js";
import UploadController from "../controllers/upload.controller.js";
import AsyncFunctionHandler from "../utils/AsyncHandler.js";

const router = Router();

/**
 * Upload video directly to S3
 *
 * POST /api/upload/video
 *
 * Content-Type:
 * multipart/form-data
 *
 * Field:
 * file
 */
router.post("/upload/video/s3", AsyncFunctionHandler(UploadController.UploadVideoToS3));
router.put("/update/video/s3/:assetId", AsyncFunctionHandler(UploadController.UpdateVideo));
router.delete("/delete/video/s3/:assetId", AsyncFunctionHandler(UploadController.DeleteVideo));
router.get("/video/s3/:assetId", AsyncFunctionHandler(UploadController.GetVideo));
router.get("/get/video/s3", AsyncFunctionHandler(UploadController.GetVideo));
/**
 * Generate presigned URL
 *
 * POST /api/upload/video/presigned-url
 */

export default router;

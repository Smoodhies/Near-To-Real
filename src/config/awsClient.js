import { S3Client } from "@aws-sdk/client-s3";
import { API_RESPONSE } from "../constants/ApiResponseBible.js";
import { API_ERROR } from "../constants/ApiErrorBible.js";
import ApiErrorObject from "../utils/ApiError.js";
import ApiResponseObject from "../utils/ApiRespone.js";


const AWS_REGION = process.env.AWS_REGION;

if (!AWS_REGION) {
   ApiErrorObject.SendError({
    ...API_ERROR.SERVER,
    statusCode: 500,
    message: "AWS region is not configured",
  });
}

export const s3Client = new S3Client({
  region: AWS_REGION,
});

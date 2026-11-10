import { photoUploadRequestSchema } from "@/lib/validation";
import { clientIp, json, readJson, route } from "@/server/http";
import { requestPhotoUpload } from "@/server/photos";

/** Step 1 of 3: a short-lived URL the browser uploads the photo to directly. */
export const POST = route(async (request) =>
  json(await requestPhotoUpload(await readJson(request, photoUploadRequestSchema), clientIp(request)), 201),
);

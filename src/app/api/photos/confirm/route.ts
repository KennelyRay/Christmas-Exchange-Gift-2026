import { photoKeySchema } from "@/lib/validation";
import { clientIp, json, readJson, route } from "@/server/http";
import { confirmPhotoUpload } from "@/server/photos";

/** Step 3 of 3: checks what actually arrived in storage before the wishlist can use it. */
export const POST = route(async (request) => {
  const { key } = await readJson(request, photoKeySchema);
  return json(await confirmPhotoUpload(key, clientIp(request)));
});

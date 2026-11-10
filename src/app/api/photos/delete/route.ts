import { photoKeySchema } from "@/lib/validation";
import { clientIp, json, readJson, route } from "@/server/http";
import { discardPhotoUpload } from "@/server/photos";

/** Only for photos not yet saved with a wishlist: submitted ones are locked. */
export const POST = route(async (request) => {
  const { key } = await readJson(request, photoKeySchema);
  await discardPhotoUpload(key, clientIp(request));
  return json({ ok: true });
});

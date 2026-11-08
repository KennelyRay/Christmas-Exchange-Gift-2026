import { requireExchange } from "@/server/exchanges";
import { ApiError, clientIp, json, route } from "@/server/http";
import { enforceLimits, ipKey } from "@/server/rate-limit";
import { storeWishlistImage } from "@/server/uploads";

export const POST = route<{ slug: string }>(async (request, { slug }) => {
  const exchange = await requireExchange(slug);
  if (exchange.status !== "open") {
    throw new ApiError(409, "pool_locked", "The pool is locked, so new wishlists are closed.");
  }
  await enforceLimits(
    [{ key: ipKey("upload", clientIp(request)), max: 120, windowSeconds: 3600 }],
    "Too many photo uploads.",
  );

  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) throw new ApiError(400, "missing_file", "Please choose a photo.");
  return json(await storeWishlistImage(exchange.id, file), 201);
});

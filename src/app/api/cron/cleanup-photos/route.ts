import { timingSafeEqual } from "node:crypto";
import { ApiError, json, route } from "@/server/http";
import { cleanupStalePhotos } from "@/server/photos";

function isFromVercelCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Runs daily from vercel.json. Vercel sends CRON_SECRET as a bearer token. */
export const GET = route(async (request) => {
  if (!isFromVercelCron(request)) throw new ApiError(401, "unauthorized", "Not allowed.");
  return json(await cleanupStalePhotos());
});

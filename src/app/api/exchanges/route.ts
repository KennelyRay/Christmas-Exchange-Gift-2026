import { createExchangeSchema } from "@/lib/validation";
import { createExchange } from "@/server/exchanges";
import { clientIp, json, readJson, route } from "@/server/http";
import { enforceLimits, ipKey } from "@/server/rate-limit";

export const POST = route(async (request) => {
  await enforceLimits(
    [{ key: ipKey("create", clientIp(request)), max: 10, windowSeconds: 3600 }],
    "That's a lot of new exchanges.",
  );
  return json(await createExchange(await readJson(request, createExchangeSchema)), 201);
});

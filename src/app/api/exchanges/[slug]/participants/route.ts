import { wishlistSubmissionSchema } from "@/lib/validation";
import { requireExchange } from "@/server/exchanges";
import { clientIp, json, readJson, route } from "@/server/http";
import { enforceLimits, ipKey } from "@/server/rate-limit";
import { submitWishlist } from "@/server/wishlists";

// POST only: a submitted wishlist has no update or delete route, by design.
export const POST = route<{ slug: string }>(async (request, { slug }) => {
  const exchange = await requireExchange(slug);
  const input = await readJson(request, wishlistSubmissionSchema);
  await enforceLimits(
    [{ key: ipKey("submit", clientIp(request)), max: 60, windowSeconds: 3600 }],
    "Too many submissions from this network.",
  );
  return json(await submitWishlist(exchange, input), 201);
});

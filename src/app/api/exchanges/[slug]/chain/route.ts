import { advanceChainSchema } from "@/lib/validation";
import { advanceChain, getChainView } from "@/server/chain";
import { requireExchange } from "@/server/exchanges";
import { json, readJson, route } from "@/server/http";
import { requireOrganizer } from "@/server/organizer";

export const GET = route<{ slug: string }>(async (_request, { slug }) =>
  json(getChainView(await requireExchange(slug))),
);

export const POST = route<{ slug: string }>(async (request, { slug }) => {
  const exchange = await requireOrganizer(request, slug);
  const { expectedStep } = await readJson(request, advanceChainSchema);
  return json(await advanceChain(exchange, expectedStep));
});

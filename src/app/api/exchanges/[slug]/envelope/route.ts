import { envelopeSchema } from "@/lib/validation";
import { openEnvelope } from "@/server/envelopes";
import { requireExchange } from "@/server/exchanges";
import { clientIp, json, readJson, route } from "@/server/http";

export const POST = route<{ slug: string }>(async (request, { slug }) => {
  const exchange = await requireExchange(slug);
  const input = await readJson(request, envelopeSchema);
  return json(await openEnvelope(exchange, input, clientIp(request)));
});

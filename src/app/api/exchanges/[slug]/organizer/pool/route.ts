import { poolActionSchema } from "@/lib/validation";
import { json, readJson, route } from "@/server/http";
import { changePool, requireOrganizer } from "@/server/organizer";

export const POST = route<{ slug: string }>(async (request, { slug }) => {
  const exchange = await requireOrganizer(request, slug);
  const { action } = await readJson(request, poolActionSchema);
  await changePool(exchange, action);
  return json({ ok: true });
});

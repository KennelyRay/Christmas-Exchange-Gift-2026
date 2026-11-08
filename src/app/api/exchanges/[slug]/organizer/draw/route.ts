import { resetDrawSchema } from "@/lib/validation";
import { resetDraw, runDraw } from "@/server/draw";
import { json, readJson, route } from "@/server/http";
import { requireOrganizer } from "@/server/organizer";

export const POST = route<{ slug: string }>(async (request, { slug }) => {
  const exchange = await requireOrganizer(request, slug);
  return json(await runDraw(exchange.id), 201);
});

export const DELETE = route<{ slug: string }>(async (request, { slug }) => {
  const exchange = await requireOrganizer(request, slug);
  const { reason } = await readJson(request, resetDrawSchema);
  await resetDraw(exchange.id, reason);
  return json({ ok: true });
});

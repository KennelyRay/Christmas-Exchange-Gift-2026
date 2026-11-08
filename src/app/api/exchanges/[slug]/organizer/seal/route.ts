import { json, route } from "@/server/http";
import { openSeal, requireOrganizer } from "@/server/organizer";

export const POST = route<{ slug: string }>(async (request, { slug }) => {
  await openSeal(await requireOrganizer(request, slug));
  return json({ ok: true });
});

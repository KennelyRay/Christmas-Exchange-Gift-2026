import { exclusionsSchema } from "@/lib/validation";
import { json, readJson, route } from "@/server/http";
import { replaceExclusions, requireOrganizer } from "@/server/organizer";

export const PUT = route<{ slug: string }>(async (request, { slug }) => {
  const exchange = await requireOrganizer(request, slug);
  const { pairs } = await readJson(request, exclusionsSchema);
  return json(await replaceExclusions(exchange, pairs));
});

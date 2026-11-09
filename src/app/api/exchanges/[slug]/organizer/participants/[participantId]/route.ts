import { z } from "zod";
import { ApiError, json, route } from "@/server/http";
import { removeParticipant, requireOrganizer } from "@/server/organizer";

type Params = { slug: string; participantId: string };

export const DELETE = route<Params>(async (request, { slug, participantId }) => {
  const exchange = await requireOrganizer(request, slug);
  if (!z.uuid().safeParse(participantId).success) {
    throw new ApiError(404, "not_found", "That person isn't in this exchange.");
  }
  await removeParticipant(exchange, participantId);
  return json({ ok: true });
});

import { z } from "zod";
import { ApiError, json, route } from "@/server/http";
import { reissueElfCode, requireOrganizer } from "@/server/organizer";

type Params = { slug: string; participantId: string };

export const POST = route<Params>(async (request, { slug, participantId }) => {
  const exchange = await requireOrganizer(request, slug);
  if (!z.uuid().safeParse(participantId).success) {
    throw new ApiError(404, "not_found", "That person isn't in this exchange.");
  }
  return json(await reissueElfCode(exchange, participantId));
});

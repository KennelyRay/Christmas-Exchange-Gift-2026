import { getLobby, requireExchange } from "@/server/exchanges";
import { json, route } from "@/server/http";

export const GET = route<{ slug: string }>(async (_request, { slug }) =>
  json(await getLobby(await requireExchange(slug))),
);

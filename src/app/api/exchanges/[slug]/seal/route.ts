import { getSeal, requireExchange } from "@/server/exchanges";
import { json, route } from "@/server/http";

export const GET = route<{ slug: string }>(async (_request, { slug }) =>
  json(getSeal(await requireExchange(slug))),
);

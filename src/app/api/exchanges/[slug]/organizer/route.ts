import { organizerLoginSchema, organizerSettingsSchema } from "@/lib/validation";
import { requireExchange } from "@/server/exchanges";
import { clientIp, json, readJson, route } from "@/server/http";
import { getDashboard, loginOrganizer, logoutCookie, requireOrganizer, updateSettings } from "@/server/organizer";

type Params = { slug: string };

export const GET = route<Params>(async (request, { slug }) =>
  json(await getDashboard(await requireOrganizer(request, slug))),
);

export const POST = route<Params>(async (request, { slug }) => {
  const exchange = await requireExchange(slug);
  const { code } = await readJson(request, organizerLoginSchema);
  const cookie = await loginOrganizer(exchange, code, clientIp(request));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } });
});

export const PATCH = route<Params>(async (request, { slug }) => {
  const exchange = await requireOrganizer(request, slug);
  await updateSettings(exchange, await readJson(request, organizerSettingsSchema));
  return json({ ok: true });
});

export const DELETE = route<Params>(async (_request, { slug }) =>
  Response.json({ ok: true }, { headers: { "Set-Cookie": logoutCookie(slug) } }),
);

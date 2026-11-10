import { PGlite } from "@electric-sql/pglite";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";
import { isSingleLoop, parseManifest, sha256HexInBrowser } from "@/lib/manifest";
import type { ChainView, DashboardView, EnvelopeView, LobbyView } from "@/lib/types";
import { hashCode } from "@/server/codes";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));

/** Stands in for Neon Object Storage: what a browser PUT would have left in the bucket. */
const storage = vi.hoisted(() => ({
  configured: true,
  objects: new Map<string, { bytes: Uint8Array; contentType: string }>(),
}));
vi.mock("@/server/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/storage")>();
  const { ApiError } = await import("@/server/http");
  const endpoint = "https://br-test.storage.c-3.ap-southeast-1.aws.neon.tech";
  return {
    ...real,
    requireStorage: () => {
      if (!storage.configured) throw new ApiError(503, "uploads_unavailable", "Photo uploads aren't set up yet.");
      return {};
    },
    publicPhotoUrl: (key: string | null) => (key && storage.configured ? `${endpoint}/wishlist-photos/${key}` : null),
    presignPhotoUpload: async (key: string, contentType: string) => ({
      url: `${endpoint}/wishlist-photos/${key}?X-Amz-Signature=test`,
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" },
      expiresIn: 300,
    }),
    headPhoto: async (key: string) => {
      const object = storage.objects.get(key);
      return object ? { size: object.bytes.length, contentType: object.contentType } : null;
    },
    readPhotoStart: async (key: string) => storage.objects.get(key)!.bytes.slice(0, 16),
    deletePhoto: async (key: string) => void storage.objects.delete(key),
    deletePhotos: async (keys: string[]) => keys.forEach((key) => storage.objects.delete(key)),
  };
});

import { POST as createRoute } from "@/app/api/exchanges/route";
import { GET as lobbyRoute } from "@/app/api/exchanges/[slug]/route";
import { GET as chainRoute, POST as advanceRoute } from "@/app/api/exchanges/[slug]/chain/route";
import { POST as envelopeRoute } from "@/app/api/exchanges/[slug]/envelope/route";
import {
  GET as dashboardRoute,
  PATCH as settingsRoute,
  POST as loginRoute,
} from "@/app/api/exchanges/[slug]/organizer/route";
import { POST as reissueRoute } from "@/app/api/exchanges/[slug]/organizer/participants/[participantId]/code/route";
import { DELETE as removeRoute } from "@/app/api/exchanges/[slug]/organizer/participants/[participantId]/route";
import { DELETE as resetRoute, POST as drawRoute } from "@/app/api/exchanges/[slug]/organizer/draw/route";
import { PUT as exclusionsRoute } from "@/app/api/exchanges/[slug]/organizer/exclusions/route";
import { POST as poolRoute } from "@/app/api/exchanges/[slug]/organizer/pool/route";
import { POST as openSealRoute } from "@/app/api/exchanges/[slug]/organizer/seal/route";
import * as participantsRoutes from "@/app/api/exchanges/[slug]/participants/route";
import { GET as cleanupRoute } from "@/app/api/cron/cleanup-photos/route";
import { POST as confirmPhotoRoute } from "@/app/api/photos/confirm/route";
import { POST as deletePhotoRoute } from "@/app/api/photos/delete/route";
import { POST as uploadUrlRoute } from "@/app/api/photos/upload-url/route";
import { GET as sealRoute } from "@/app/api/exchanges/[slug]/seal/route";

let client: PGlite;
let db: Db;
let ipCounter = 0;

beforeAll(async () => {
  client = new PGlite();
  const instance = drizzle(client, { schema });
  await migrate(instance, { migrationsFolder: "./drizzle" });
  db = instance as unknown as Db;
  state.db = db;
});

type Handler<P> = (request: Request, context: { params: Promise<P> }) => Promise<Response>;

function call<P>(
  handler: Handler<P>,
  params: P,
  options: { method?: string; body?: unknown; cookie?: string; ip?: string } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.cookie) headers.set("cookie", options.cookie);
  headers.set("x-real-ip", options.ip ?? `10.0.0.${++ipCounter}`);
  const request = new Request("http://test.local/api", {
    method: options.method ?? "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return handler(request, { params: Promise.resolve(params) });
}

const body = async <T,>(response: Response) => (await response.json()) as T;
const errorCode = async (response: Response) =>
  (await body<{ error: { code: string } }>(response)).error.code;

const item = (name = "Scarf", priceCentavos = 49_900) => ({ name, priceCentavos });

async function createExchange(input: Record<string, unknown> = {}) {
  const response = await call(createRoute, {}, { body: { name: "Our Family", ...input } });
  expect(response.status).toBe(201);
  const { slug, organizerCode } = await body<{ slug: string; organizerCode: string }>(response);

  const login = await call(loginRoute, { slug }, { body: { code: organizerCode } });
  expect(login.status).toBe(200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  return { slug, organizerCode, cookie };
}

/** "Ana Dela Cruz" becomes first name "Ana", last name "Dela Cruz". */
function nameFields(name: string) {
  const [firstName, ...rest] = name.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

async function join(slug: string, name: string, items = [item()]) {
  const response = await call(participantsRoutes.POST, { slug }, { body: { ...nameFields(name), items } });
  expect(response.status).toBe(201);
  return body<{ participantId: string; name: string; elfCode: string }>(response);
}

const FOUR = ["Ana Reyes", "Ben Santos", "Carla Lim", "Dino Tan"];
const SIX = [...FOUR, "Ella Go", "Fred Uy"];

async function setUp(names = FOUR) {
  const exchange = await createExchange();
  const people = [];
  for (const name of names) people.push(await join(exchange.slug, name, [item(`${name}'s wish`)]));
  return { ...exchange, people };
}

async function drawn(names?: string[]) {
  const setup = await setUp(names);
  const { slug, cookie } = setup;
  expect((await call(poolRoute, { slug }, { body: { action: "lock" }, cookie })).status).toBe(200);
  expect((await call(drawRoute, { slug }, { cookie })).status).toBe(201);
  return setup;
}

async function openAll(slug: string, people: Array<{ participantId: string; elfCode: string; name: string }>) {
  const results = new Map<string, string>();
  for (const person of people) {
    const response = await call(envelopeRoute, { slug }, { body: { participantId: person.participantId, code: person.elfCode } });
    expect(response.status).toBe(200);
    const view = await body<EnvelopeView>(response);
    if (view.state !== "ready") throw new Error("expected a ready envelope");
    results.set(person.name, view.recipientName);
  }
  return results;
}

const reachChristmasNight = (slug: string) =>
  client.query(`UPDATE exchanges SET reveal_at = now() - interval '1 minute' WHERE slug = $1`, [slug]);

const lobby = async (slug: string) => body<LobbyView>(await call(lobbyRoute, { slug }, { method: "GET" }));

describe("wishlist submission and locking", () => {
  it("creates an exchange and shows joiners without their wishlists", async () => {
    const { slug, people } = await setUp();
    const view = await lobby(slug);
    expect(view.participants.map((p) => p.name)).toEqual(FOUR);
    expect(view.participants[0].itemCount).toBe(1);
    expect(JSON.stringify(view)).not.toContain("wish");
    expect(JSON.stringify(view)).not.toContain(people[0].elfCode);
  });

  it("stores only a hash of the Elf Code", async () => {
    const { people } = await setUp();
    const [row] = await db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.id, people[0].participantId));
    expect(row.elfCodeHash).toMatch(/^\$2[aby]\$/);
    expect(row.elfCodeHash).not.toContain(people[0].elfCode);
  });

  it("stores first name, last name, and the family key separately", async () => {
    const { slug } = await createExchange();
    const person = await join(slug, "José Dela Cruz");
    const [row] = await db.select().from(schema.participants).where(eq(schema.participants.id, person.participantId));
    expect([row.firstName, row.lastName, row.lastNameKey]).toEqual(["José", "Dela Cruz", "dela cruz"]);
    expect(person.name).toBe("José Dela Cruz");
  });

  it("requires both names on the server, and says which is missing", async () => {
    const { slug } = await createExchange();
    const submit = (names: object) => call(participantsRoutes.POST, { slug }, { body: { ...names, items: [item()] } });
    const fieldsOf = async (response: Response) =>
      Object.keys((await body<{ error: { fields: object } }>(response)).error.fields);

    expect(await fieldsOf(await submit({ lastName: "Cruz" }))).toEqual(["firstName"]);
    expect(await fieldsOf(await submit({ firstName: "Eli", lastName: "   " }))).toEqual(["lastName"]);
    expect((await submit({ firstName: "E".repeat(41), lastName: "Cruz" })).status).toBe(422);
  });

  it.each([
    ["  ana ", "REYES "],
    ["Ána", "Reyés"],
    ["ana", "reyes"],
  ])("rejects %j %j as a duplicate of Ana Reyes", async (firstName, lastName) => {
    const { slug } = await setUp();
    const response = await call(participantsRoutes.POST, { slug }, { body: { firstName, lastName, items: [item()] } });
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("name_taken");
  });

  it("allows the same first name in a different family", async () => {
    const { slug } = await setUp();
    expect((await join(slug, "Ana Villanueva")).name).toBe("Ana Villanueva");
  });

  it("validates items, prices, and links", async () => {
    const { slug } = await createExchange();
    const submit = (items: unknown[]) =>
      call(participantsRoutes.POST, { slug }, { body: { firstName: "Eli", lastName: "Cruz", items } });

    expect((await submit([])).status).toBe(422);
    expect((await submit([{ name: "Bag", priceCentavos: -5 }])).status).toBe(422);
    expect((await submit([{ name: "Bag", priceCentavos: 0 }])).status).toBe(422);
    expect((await submit([{ name: "Bag", priceCentavos: 100, url: "javascript:alert(1)" }])).status).toBe(422);
    expect((await submit([{ name: "Bag", priceCentavos: 100, imageKey: "https://evil.example/x.png" }])).status).toBe(422);
  });

  it("saves an item with no price as empty, whether it's left out or sent as null", async () => {
    const { slug } = await createExchange();
    const response = await call(participantsRoutes.POST, { slug }, {
      body: { firstName: "Eli", lastName: "Cruz", items: [{ name: "Bag" }, { name: "Mug", priceCentavos: null }, item("Scarf", 500)] },
    });
    expect(response.status).toBe(201);

    const { participantId } = await body<{ participantId: string }>(response);
    const saved = await db.select().from(schema.wishlistItems).where(eq(schema.wishlistItems.participantId, participantId));
    const priceOf = (name: string) => saved.find((row) => row.name === name)?.priceCentavos;
    expect([priceOf("Bag"), priceOf("Mug"), priceOf("Scarf")]).toEqual([null, null, 500]);
  });

  it("offers no route to change a submitted wishlist", () => {
    expect(Object.keys(participantsRoutes)).toEqual(["POST"]);
  });

  it("blocks edits at the database level too", async () => {
    const { people } = await setUp();
    const update = db
      .update(schema.wishlistItems)
      .set({ priceCentavos: 1 })
      .where(eq(schema.wishlistItems.participantId, people[0].participantId));
    await expect(update).rejects.toThrow();

    const remove = db.delete(schema.wishlistItems).where(eq(schema.wishlistItems.participantId, people[0].participantId));
    await expect(remove).rejects.toThrow();

    const rename = db
      .update(schema.participants)
      .set({ firstName: "Someone Else" })
      .where(eq(schema.participants.id, people[0].participantId));
    await expect(rename).rejects.toThrow();

    const changeFamily = db
      .update(schema.participants)
      .set({ lastNameKey: "someone else" })
      .where(eq(schema.participants.id, people[0].participantId));
    await expect(changeFamily).rejects.toThrow();
  });

  it("closes submissions when the pool locks", async () => {
    const { slug, cookie } = await setUp();
    await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });
    const response = await call(participantsRoutes.POST, { slug }, { body: { firstName: "Late", lastName: "Comer", items: [item()] } });
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("pool_locked");
  });
});

describe("wishlist photos", () => {
  const MB5 = 5 * 1024 * 1024;
  const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 9, 9, 9, 9, 9, 9]);
  const PDF = new TextEncoder().encode("%PDF-1.7 not really a picture");
  const KEY_PATTERN = /^exchanges\/[0-9a-f-]{36}\/items\/[0-9a-f-]{36}\.webp$/;

  const exchangeIdOf = async (slug: string) =>
    (await db.select({ id: schema.exchanges.id }).from(schema.exchanges).where(eq(schema.exchanges.slug, slug)))[0].id;

  async function requestUpload(exchangeId: string, contentType = "image/webp", size = WEBP.length) {
    return call(uploadUrlRoute, {}, { body: { exchangeId, contentType, size } });
  }

  /** What the browser does with the presigned URL. */
  function browserPut(key: string, bytes: Uint8Array, contentType = "image/webp") {
    storage.objects.set(key, { bytes, contentType });
  }

  const confirm = (key: string) => call(confirmPhotoRoute, {}, { body: { key } });

  async function uploadedPhoto(exchangeId: string) {
    const { key } = await body<{ key: string }>(await requestUpload(exchangeId));
    browserPut(key, WEBP);
    expect((await confirm(key)).status).toBe(200);
    return key;
  }

  const submitWithPhoto = (slug: string, name: string, imageKey: string) =>
    call(participantsRoutes.POST, { slug }, { body: { ...nameFields(name), items: [{ name: "Slippers", imageKey }] } });

  it("says plainly when storage isn't set up", async () => {
    storage.configured = false;
    try {
      const { slug } = await createExchange();
      const response = await requestUpload(await exchangeIdOf(slug));
      expect(response.status).toBe(503);
      expect(await errorCode(response)).toBe("uploads_unavailable");
    } finally {
      storage.configured = true;
    }
  });

  it("hands out a fresh, unguessable key under this exchange every time", async () => {
    const { slug } = await createExchange();
    const exchangeId = await exchangeIdOf(slug);
    const first = await body<{ key: string; uploadUrl: string; headers: Record<string, string> }>(await requestUpload(exchangeId));
    const second = await body<{ key: string }>(await requestUpload(exchangeId));

    expect(first.key).toMatch(KEY_PATTERN);
    expect(first.key.startsWith(`exchanges/${exchangeId}/items/`)).toBe(true);
    expect(second.key).not.toBe(first.key);
    expect(first.uploadUrl).toContain(first.key);
    expect(first.headers).toEqual({ "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" });
  });

  it("refuses other file types and anything over 5 MB", async () => {
    const exchangeId = await exchangeIdOf((await createExchange()).slug);
    expect((await requestUpload(exchangeId, "application/pdf")).status).toBe(415);
    expect((await requestUpload(exchangeId, "image/heic")).status).toBe(415);
    expect((await requestUpload(exchangeId, "image/jpeg", MB5 + 1)).status).toBe(413);
    expect((await requestUpload(exchangeId, "image/png", MB5)).status).toBe(201);
  });

  it("refuses unknown exchanges and closes uploads once the pool is locked", async () => {
    expect((await requestUpload("00000000-0000-4000-8000-000000000000")).status).toBe(404);

    const { slug, cookie } = await setUp();
    await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });
    const response = await requestUpload(await exchangeIdOf(slug));
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("pool_locked");
  });

  it("confirms a real photo and returns its public URL", async () => {
    const exchangeId = await exchangeIdOf((await createExchange()).slug);
    const { key } = await body<{ key: string }>(await requestUpload(exchangeId));
    browserPut(key, WEBP);
    const confirmed = await body<{ key: string; url: string }>(await confirm(key));
    expect(confirmed).toEqual({ key, url: `https://br-test.storage.c-3.ap-southeast-1.aws.neon.tech/wishlist-photos/${key}` });
  });

  it("says when the upload never arrived", async () => {
    const exchangeId = await exchangeIdOf((await createExchange()).slug);
    const { key } = await body<{ key: string }>(await requestUpload(exchangeId));
    const response = await confirm(key);
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe("photo_missing");
  });

  it("deletes a file over 5 MB sent straight to the upload URL", async () => {
    const exchangeId = await exchangeIdOf((await createExchange()).slug);
    const { key } = await body<{ key: string }>(await requestUpload(exchangeId));
    const huge = new Uint8Array(MB5 + 1);
    huge.set(WEBP);
    browserPut(key, huge);

    expect((await confirm(key)).status).toBe(413);
    expect(storage.objects.has(key)).toBe(false);
    expect(await db.select().from(schema.photoUploads).where(eq(schema.photoUploads.key, key))).toHaveLength(0);
  });

  it("deletes a PDF renamed to look like a picture", async () => {
    const exchangeId = await exchangeIdOf((await createExchange()).slug);
    const { key } = await body<{ key: string }>(await requestUpload(exchangeId, "image/jpeg"));
    browserPut(key, PDF, "image/jpeg");

    expect((await confirm(key)).status).toBe(415);
    expect(storage.objects.has(key)).toBe(false);
  });

  it("refuses keys it never handed out", async () => {
    const exchangeId = await exchangeIdOf((await createExchange()).slug);
    const madeUp = `exchanges/${exchangeId}/items/11111111-1111-4111-8111-111111111111.webp`;
    browserPut(madeUp, WEBP);
    expect((await confirm(madeUp)).status).toBe(422);
    expect((await confirm("../../etc/passwd")).status).toBe(422);
  });

  it("saves the key with the wishlist and shows the photo in the envelope", async () => {
    const { slug, cookie } = await createExchange();
    const key = await uploadedPhoto(await exchangeIdOf(slug));
    const mia = await submitWithPhoto(slug, "Mia Cruz", key);
    expect(mia.status).toBe(201);

    const [saved] = await db.select().from(schema.wishlistItems).innerJoin(schema.participants, eq(schema.participants.id, schema.wishlistItems.participantId)).where(eq(schema.participants.firstName, "Mia"));
    expect(saved.wishlist_items.imageKey).toBe(key);

    const others = [];
    for (const name of ["Ana Reyes", "Ben Santos", "Carla Lim"]) others.push(await join(slug, name));
    await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });
    await call(drawRoute, { slug }, { cookie });

    const views = await Promise.all(
      others.map(async (person) => body<EnvelopeView>(await call(envelopeRoute, { slug }, { body: { participantId: person.participantId, code: person.elfCode } }))),
    );
    const miaGiver = views.find((view) => view.state === "ready" && view.recipientName === "Mia Cruz");
    if (miaGiver?.state !== "ready") throw new Error("someone should be giving to Mia");
    expect(miaGiver.items[0].imageUrl).toBe(`https://br-test.storage.c-3.ap-southeast-1.aws.neon.tech/wishlist-photos/${key}`);
    expect(Object.keys(miaGiver.items[0])).not.toContain("imageKey");
  });

  it("locks a photo once its wishlist is submitted", async () => {
    const { slug } = await createExchange();
    const key = await uploadedPhoto(await exchangeIdOf(slug));
    await submitWithPhoto(slug, "Mia Cruz", key);

    const removal = await call(deletePhotoRoute, {}, { body: { key } });
    expect(removal.status).toBe(409);
    expect(storage.objects.has(key)).toBe(true);

    const reuse = await submitWithPhoto(slug, "Leo Tan", key);
    expect(await errorCode(reuse)).toBe("invalid_image");
  });

  it("refuses photos that weren't confirmed or belong to another exchange", async () => {
    const { slug } = await createExchange();
    const exchangeId = await exchangeIdOf(slug);
    const { key: unconfirmed } = await body<{ key: string }>(await requestUpload(exchangeId));
    browserPut(unconfirmed, WEBP);
    expect(await errorCode(await submitWithPhoto(slug, "Mia Cruz", unconfirmed))).toBe("invalid_image");

    const other = await createExchange();
    const theirs = await uploadedPhoto(await exchangeIdOf(other.slug));
    expect(await errorCode(await submitWithPhoto(slug, "Mia Cruz", theirs))).toBe("invalid_image");

    // Nothing was saved, so Mia can still join without a photo.
    expect((await join(slug, "Mia Cruz")).name).toBe("Mia Cruz");
  });

  it("removes a replaced photo before the wishlist is submitted", async () => {
    const exchangeId = await exchangeIdOf((await createExchange()).slug);
    const key = await uploadedPhoto(exchangeId);
    expect((await call(deletePhotoRoute, {}, { body: { key } })).status).toBe(200);
    expect(storage.objects.has(key)).toBe(false);
    expect(await db.select().from(schema.photoUploads).where(eq(schema.photoUploads.key, key))).toHaveLength(0);
  });

  it("cleans up abandoned uploads after 48 hours, but never submitted ones", async () => {
    const { slug } = await createExchange();
    const exchangeId = await exchangeIdOf(slug);
    const kept = await uploadedPhoto(exchangeId);
    await submitWithPhoto(slug, "Mia Cruz", kept);
    const abandoned = await uploadedPhoto(exchangeId);
    const recent = await uploadedPhoto(exchangeId);
    await client.query(`UPDATE photo_uploads SET created_at = now() - interval '49 hours' WHERE key IN ($1, $2)`, [kept, abandoned]);

    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    try {
      expect((await call(cleanupRoute, {}, { method: "GET" })).status).toBe(401);

      const request = new Request("http://test.local/api", { headers: { authorization: "Bearer cron-test-secret" } });
      const response = await cleanupRoute(request, { params: Promise.resolve({}) });
      expect(response.status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }

    expect(storage.objects.has(abandoned)).toBe(false);
    expect(storage.objects.has(kept)).toBe(true);
    expect(storage.objects.has(recent)).toBe(true);
  });

  it("refuses the cleanup when no cron secret is configured", async () => {
    const request = new Request("http://test.local/api", { headers: { authorization: "Bearer " } });
    expect((await cleanupRoute(request, { params: Promise.resolve({}) })).status).toBe(401);
  });
});

describe("organizer authority", () => {
  it("requires the organizer session for every organizer action", async () => {
    const { slug, people } = await setUp();
    const anon = { slug };
    expect((await call(dashboardRoute, anon, { method: "GET" })).status).toBe(401);
    expect((await call(settingsRoute, anon, { method: "PATCH", body: { budgetCentavos: 100 } })).status).toBe(401);
    expect((await call(poolRoute, anon, { body: { action: "lock" } })).status).toBe(401);
    expect((await call(exclusionsRoute, anon, { method: "PUT", body: { pairs: [] } })).status).toBe(401);
    expect((await call(drawRoute, anon, {})).status).toBe(401);
    expect((await call(resetRoute, anon, { method: "DELETE", body: { reason: "nope" } })).status).toBe(401);
    expect((await call(openSealRoute, anon, {})).status).toBe(401);
    expect((await call(advanceRoute, anon, { body: { expectedStep: 0 } })).status).toBe(401);
    expect((await call(reissueRoute, { slug, participantId: people[0].participantId }, {})).status).toBe(401);
  });

  it("does not accept another exchange's organizer session", async () => {
    const first = await createExchange();
    const second = await createExchange();
    const forged = first.cookie.replace(first.slug, second.slug);
    expect((await call(dashboardRoute, { slug: second.slug }, { method: "GET", cookie: forged })).status).toBe(401);
  });

  it("never gives the organizer assignment data", async () => {
    const { slug, cookie, people } = await drawn();
    const response = await call(dashboardRoute, { slug }, { method: "GET", cookie });
    const view = await body<DashboardView>(response);
    expect(view.commitmentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(view.participants[0]).sort()).toEqual(["codeReissuedAt", "familyKey", "hasOpened", "id", "itemCount", "lastName", "name"]);
    expect(view.participants).toHaveLength(people.length);
  });

  it("freezes settings after the draw", async () => {
    const { slug, cookie } = await drawn();
    const response = await call(settingsRoute, { slug }, { method: "PATCH", body: { budgetCentavos: 100 }, cookie });
    expect(response.status).toBe(409);
  });
});

describe("the draw", () => {
  it("gives everyone a valid recipient in one loop", async () => {
    const { slug, people } = await drawn(SIX);
    const results = await openAll(slug, people);
    const links = [...results].map(([giver, recipient]) => ({ giver, recipient }));
    expect(isSingleLoop(links)).toBe(true);
  });

  it("stores assignments encrypted, with nothing about the chain in the clear", async () => {
    const { slug, people } = await drawn();
    const [exchange] = await db.select().from(schema.exchanges).where(eq(schema.exchanges.slug, slug));
    const rows = await db.select().from(schema.assignments).where(eq(schema.assignments.exchangeId, exchange.id));

    expect(rows).toHaveLength(people.length);
    const raw = JSON.stringify(rows) + exchange.sealedManifest;
    for (const person of people) {
      expect(raw.replaceAll(person.participantId, "")).not.toContain(person.participantId);
      expect(raw).not.toContain(person.name);
    }
    expect(Object.keys(rows[0]).sort()).toEqual(["createdAt", "exchangeId", "generation", "giverId", "id", "sealedRecipient"]);
  });

  it("refuses to run twice", async () => {
    const { slug, cookie } = await drawn();
    const response = await call(drawRoute, { slug }, { cookie });
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("already_drawn");
  });

  it("refuses to run before the pool is locked", async () => {
    const { slug, cookie } = await setUp();
    expect(await errorCode(await call(drawRoute, { slug }, { cookie }))).toBe("pool_not_locked");
  });

  it("lets only one of two simultaneous draws through", async () => {
    const { slug, cookie } = await setUp();
    await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });
    const responses = await Promise.all([call(drawRoute, { slug }, { cookie }), call(drawRoute, { slug }, { cookie })]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it("rolls everything back if any part of the draw fails", async () => {
    const { slug, cookie } = await setUp();
    await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });

    await client.exec(`
      CREATE FUNCTION fail_draw() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event = 'draw_run' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER fail_draw_trigger BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_draw();
    `);
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await call(drawRoute, { slug }, { cookie })).status).toBe(500);
    } finally {
      silence.mockRestore();
      await client.exec(`DROP TRIGGER fail_draw_trigger ON audit_log; DROP FUNCTION fail_draw();`);
    }

    const [exchange] = await db.select().from(schema.exchanges).where(eq(schema.exchanges.slug, slug));
    expect(exchange.status).toBe("locked");
    expect(exchange.commitmentHash).toBeNull();
    expect(await db.select().from(schema.assignments).where(eq(schema.assignments.exchangeId, exchange.id))).toHaveLength(0);
  });

  it("respects exclusion rules", async () => {
    const { slug, cookie, people } = await setUp(SIX);
    const [ana, ben, carla, dino] = people;
    const rule = await call(exclusionsRoute, { slug }, {
      method: "PUT",
      cookie,
      body: { pairs: [[ana.participantId, ben.participantId], [carla.participantId, dino.participantId]] },
    });
    expect(await body(rule)).toEqual({ count: 2, feasible: true });

    await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });
    await call(drawRoute, { slug }, { cookie });
    const results = await openAll(slug, people);
    expect(results.get("Ana Reyes")).not.toBe("Ben Santos");
    expect(results.get("Ben Santos")).not.toBe("Ana Reyes");
    expect(results.get("Carla Lim")).not.toBe("Dino Tan");
    expect(results.get("Dino Tan")).not.toBe("Carla Lim");
  });

  it("never pairs people whose last names differ only by case, accent, or spacing", async () => {
    const names = ["Ana Dela Cruz", "Ben dela  cruz", "Carla DÉLA CRUZ", "Dino Lim", "Ella Tan", "Fred Go"];
    const family = new Set(["Ana Dela Cruz", "Ben dela cruz", "Carla DÉLA CRUZ"]);

    for (let run = 0; run < 5; run++) {
      const { slug, cookie, people } = await setUp(names);
      await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });
      expect((await call(drawRoute, { slug }, { cookie })).status).toBe(201);
      for (const [giver, recipient] of await openAll(slug, people)) {
        expect(family.has(giver) && family.has(recipient)).toBe(false);
      }
    }
  });

  const SANTOS_MAJORITY = [
    ...["Ana", "Ben", "Carla", "Dino", "Ella", "Fred"].map((first) => `${first} Santos`),
    "Gia Lim",
    "Hugo Tan",
    "Ivy Go",
    "Jun Uy",
  ];
  const SANTOS_MESSAGE = "The Santos family has 6 of 10 people, so they can't avoid drawing each other.";

  it("warns on the public lobby as soon as one family is over half", async () => {
    const { slug } = await setUp(SANTOS_MAJORITY);
    expect((await lobby(slug)).drawWarning).toContain(SANTOS_MESSAGE);
  });

  it("clears the lobby warning once enough other families join", async () => {
    const { slug } = await setUp(SANTOS_MAJORITY);
    await join(slug, "Kim Yu");
    await join(slug, "Lea Ong");
    expect((await lobby(slug)).drawWarning).toBeNull();
  });

  it("stays quiet until there are enough people to judge", async () => {
    const { slug } = await setUp(["Ana Santos", "Ben Santos"]);
    expect((await lobby(slug)).drawWarning).toBeNull();
  });

  it("refuses to lock while one family is over half, since locking blocks the fix", async () => {
    const { slug, cookie } = await setUp(SANTOS_MAJORITY);
    const response = await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe("family_majority");

    const view = await body<DashboardView>(await call(dashboardRoute, { slug }, { method: "GET", cookie }));
    expect(view.drawCheck).toEqual({ message: expect.stringContaining(SANTOS_MESSAGE), blocksLock: true });
  });

  it("blocks the draw itself with the same friendly message", async () => {
    const { slug, cookie } = await setUp(SANTOS_MAJORITY);
    await client.query(`UPDATE exchanges SET status = 'locked' WHERE slug = $1`, [slug]);

    const response = await call(drawRoute, { slug }, { cookie });
    expect(response.status).toBe(422);
    const { error } = await body<{ error: { code: string; message: string } }>(response);
    expect(error.code).toBe("draw_family_majority");
    expect(error.message).toContain(SANTOS_MESSAGE);
  });

  it("keeps manual rules private on the lobby while telling the organizer who is stuck", async () => {
    const { slug, cookie, people } = await setUp();
    const [ana, ben, carla] = people;
    await call(exclusionsRoute, { slug }, {
      method: "PUT",
      cookie,
      body: { pairs: [[ana.participantId, ben.participantId], [ana.participantId, carla.participantId]] },
    });

    const warning = (await lobby(slug)).drawWarning!;
    expect(warning).toBeTruthy();
    expect(warning).not.toContain("Ana");

    const view = await body<DashboardView>(await call(dashboardRoute, { slug }, { method: "GET", cookie }));
    expect(view.drawCheck?.message).toContain("Ana Reyes");
    expect(view.drawCheck?.blocksLock).toBe(false);
  });

  it("explains impossible rules in plain language", async () => {
    const { slug, cookie, people } = await setUp();
    const [ana, ben, carla] = people;
    const rule = await call(exclusionsRoute, { slug }, {
      method: "PUT",
      cookie,
      body: { pairs: [[ana.participantId, ben.participantId], [ana.participantId, carla.participantId]] },
    });
    expect(await body(rule)).toEqual({ count: 2, feasible: false });

    await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });
    const response = await call(drawRoute, { slug }, { cookie });
    expect(response.status).toBe(422);
    const { error } = await body<{ error: { message: string } }>(response);
    expect(error.message).toContain("Ana");
  });

  it("rejects rules that mention outsiders", async () => {
    const { slug, cookie, people } = await setUp();
    const other = await setUp(["Xia Wong", "Yul Cruz", "Zed Ramos"]);
    const response = await call(exclusionsRoute, { slug }, {
      method: "PUT",
      cookie,
      body: { pairs: [[people[0].participantId, other.people[0].participantId]] },
    });
    expect(response.status).toBe(422);
  });

  it("makes a reset public and permanent in the log", async () => {
    const { slug, cookie } = await drawn();
    const before = await lobby(slug);
    const response = await call(resetRoute, { slug }, { method: "DELETE", cookie, body: { reason: "Tito Boy joined late" } });
    expect(response.status).toBe(200);

    const after = await lobby(slug);
    expect(after.status).toBe("locked");
    expect(after.commitmentHash).toBeNull();
    const entry = after.audit.find((a) => a.event === "draw_reset")!;
    expect(entry.detail).toContain("Tito Boy joined late");
    expect(entry.detail).toContain(before.commitmentHash!.slice(0, 12));

    await call(drawRoute, { slug }, { cookie });
    expect((await lobby(slug)).drawGeneration).toBe(2);
  });

  it("keeps the audit log append-only", async () => {
    const { slug } = await setUp();
    const [exchange] = await db.select().from(schema.exchanges).where(eq(schema.exchanges.slug, slug));
    await expect(db.delete(schema.auditLog).where(eq(schema.auditLog.exchangeId, exchange.id))).rejects.toThrow();
    await expect(
      db.update(schema.auditLog).set({ detail: "nothing happened" }).where(eq(schema.auditLog.exchangeId, exchange.id)),
    ).rejects.toThrow();
  });
});

describe("envelopes and Elf Codes", () => {
  it("shows the recipient's full wishlist and can be reopened", async () => {
    const { slug, people } = await drawn();
    const request = { body: { participantId: people[0].participantId, code: people[0].elfCode } };
    const first = await body<EnvelopeView>(await call(envelopeRoute, { slug }, request));
    const second = await body<EnvelopeView>(await call(envelopeRoute, { slug }, request));
    if (first.state !== "ready") throw new Error("expected a ready envelope");
    expect(first.items[0].name).toBe(`${first.recipientName}'s wish`);
    expect(second).toEqual(first);
  });

  it("accepts a code typed loosely", async () => {
    const { slug, people } = await drawn();
    const { elfCode } = people[0];
    expect(elfCode).toMatch(/^\d{6}$/);
    const loose = `  ${elfCode.slice(0, 3)} ${elfCode.slice(3)} `;
    const response = await call(envelopeRoute, { slug }, { body: { participantId: people[0].participantId, code: loose } });
    expect(response.status).toBe(200);
  });

  it("keeps older word codes working for people who already joined", async () => {
    const { slug, people } = await drawn();
    const { participantId } = people[0];
    await db
      .update(schema.participants)
      .set({ elfCodeHash: await hashCode("snow-frost-holly-ivy") })
      .where(eq(schema.participants.id, participantId));

    for (const code of ["snow-frost-holly-ivy", "Snow Frost Holly Ivy", "snowfrosthollyivy"]) {
      expect((await call(envelopeRoute, { slug }, { body: { participantId, code } })).status).toBe(200);
    }
  });

  it("accepts an Organizer Code typed with no gaps between the words", async () => {
    const { slug, organizerCode } = await createExchange();
    const response = await call(loginRoute, { slug }, { body: { code: organizerCode.replaceAll("-", "") } });
    expect(response.status).toBe(200);
  });

  it("says to wait when the code is right but the draw hasn't run", async () => {
    const { slug, people } = await setUp();
    const response = await call(envelopeRoute, { slug }, { body: { participantId: people[0].participantId, code: people[0].elfCode } });
    expect((await body<EnvelopeView>(response)).state).toBe("waiting");
  });

  it("rejects someone else's code", async () => {
    const { slug, people } = await drawn();
    const response = await call(envelopeRoute, { slug }, { body: { participantId: people[0].participantId, code: people[1].elfCode } });
    expect(response.status).toBe(401);
  });

  it("locks out brute-force guessing, even for the right code afterwards", async () => {
    const { slug, people } = await drawn();
    const { participantId, elfCode } = people[0];
    for (let i = 0; i < 6; i++) {
      expect((await call(envelopeRoute, { slug }, { body: { participantId, code: "wrong-guess" } })).status).toBe(401);
    }
    const blocked = await call(envelopeRoute, { slug }, { body: { participantId, code: elfCode } });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(50 * 60);
  });

  it("counts simultaneous guesses against the limit", async () => {
    const { slug, people } = await drawn();
    const { participantId } = people[0];
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => call(envelopeRoute, { slug }, { body: { participantId, code: "bad-guess" } })),
    );
    expect(responses.filter((r) => r.status === 429)).toHaveLength(6);
  });

  it("limits guesses from one network across different people", async () => {
    const { slug, people } = await drawn();
    const ip = "203.0.113.50";
    let blocked = 0;
    for (let round = 0; round < 12; round++) {
      for (const { participantId } of people) {
        const response = await call(envelopeRoute, { slug }, { ip, body: { participantId, code: "nope-nope" } });
        if (response.status === 429) blocked++;
      }
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it("does not limit a family opening envelopes on one Wi-Fi", async () => {
    const { slug, people } = await drawn();
    const ip = "203.0.113.77";
    for (let round = 0; round < 15; round++) {
      for (const { participantId, elfCode } of people) {
        const response = await call(envelopeRoute, { slug }, { ip, body: { participantId, code: elfCode } });
        expect(response.status).toBe(200);
      }
    }
  });

  it("reissues a code publicly, kills the old one, and clears the lockout", async () => {
    const { slug, cookie, people } = await drawn();
    const { participantId, elfCode } = people[0];
    for (let i = 0; i < 7; i++) await call(envelopeRoute, { slug }, { body: { participantId, code: "wrong" } });

    const response = await call(reissueRoute, { slug, participantId }, { cookie });
    const issued = await body<{ name: string; elfCode: string }>(response);
    expect(Object.keys(issued).sort()).toEqual(["elfCode", "name"]);

    expect((await call(envelopeRoute, { slug }, { body: { participantId, code: elfCode } })).status).toBe(401);
    const opened = await call(envelopeRoute, { slug }, { body: { participantId, code: issued.elfCode } });
    const view = await body<EnvelopeView>(opened);
    if (view.state !== "ready") throw new Error("expected a ready envelope");
    expect(view.codeReissuedAt).toBeTruthy();

    expect((await lobby(slug)).audit.some((a) => a.event === "code_reissued" && a.detail.includes("Ana"))).toBe(true);
  });

  it("cannot reissue a code for someone in another exchange", async () => {
    const { slug, cookie } = await setUp();
    const other = await setUp();
    const response = await call(reissueRoute, { slug, participantId: other.people[0].participantId }, { cookie });
    expect(response.status).toBe(404);
  });

  it("locks out organizer code guessing", async () => {
    const { slug } = await createExchange();
    for (let i = 0; i < 8; i++) {
      expect((await call(loginRoute, { slug }, { body: { code: "not-the-code" } })).status).toBe(401);
    }
    expect((await call(loginRoute, { slug }, { body: { code: "not-the-code" } })).status).toBe(429);
  });
});

describe("Gift Chain and the seal", () => {
  const chain = async (slug: string) => body<ChainView>(await call(chainRoute, { slug }, { method: "GET" }));
  const advance = (slug: string, cookie: string, expectedStep: number) =>
    call(advanceRoute, { slug }, { body: { expectedStep }, cookie });

  it("stays sealed from everyone, including the organizer, before Christmas Night", async () => {
    const { slug, cookie } = await drawn();
    const view = await chain(slug);
    expect(view.state).toBe("sealed");
    expect(Object.keys(view).sort()).toEqual(["revealAt", "state"]);

    expect(await errorCode(await advance(slug, cookie, 0))).toBe("still_sealed");
    expect(await errorCode(await call(openSealRoute, { slug }, { cookie }))).toBe("seal_locked");
  });

  it("freezes the reveal time at the draw", async () => {
    const { slug, cookie } = await drawn();
    const earlier = new Date(Date.now() + 60_000).toISOString();
    const response = await call(settingsRoute, { slug }, { method: "PATCH", body: { revealAt: earlier }, cookie });
    expect(response.status).toBe(409);
  });

  it("logs any change to Christmas Night publicly", async () => {
    const { slug, cookie } = await setUp();
    const later = new Date(Date.now() + 86_400_000).toISOString();
    await call(settingsRoute, { slug }, { method: "PATCH", body: { revealAt: later }, cookie });
    expect((await lobby(slug)).audit.some((a) => a.event === "reveal_time_changed")).toBe(true);
  });

  it("reveals exactly one link per press and closes the loop", async () => {
    const { slug, cookie, people } = await drawn();
    await reachChristmasNight(slug);
    const truth = await openAll(slug, people);

    const start = await chain(slug);
    if (start.state !== "live") throw new Error("expected live");
    expect(start.sequence).toEqual([]);
    expect(start.totalSteps).toBe(people.length + 1);

    for (let step = 0; step < start.totalSteps; step++) {
      const view = await body<ChainView>(await advance(slug, cookie, step));
      if (view.state !== "live") throw new Error("expected live");
      expect(view.sequence).toHaveLength(step + 1);
      if (step > 0) expect(view.sequence[step]).toBe(truth.get(view.sequence[step - 1]));
    }

    const end = await chain(slug);
    if (end.state !== "live") throw new Error("expected live");
    expect(end.sequence[end.sequence.length - 1]).toBe(end.sequence[0]);
  });

  it("ignores double presses and advancing past the end", async () => {
    const { slug, cookie, people } = await drawn();
    await reachChristmasNight(slug);

    await Promise.all([advance(slug, cookie, 0), advance(slug, cookie, 0), advance(slug, cookie, 0)]);
    let view = await chain(slug);
    expect(view.state === "live" && view.step).toBe(1);

    for (let step = 1; step <= people.length; step++) await advance(slug, cookie, step);
    await advance(slug, cookie, people.length + 1);
    view = await chain(slug);
    expect(view.state === "live" && view.step).toBe(people.length + 1);
  });

  it("blocks a reset once the reveal has started", async () => {
    const { slug, cookie } = await drawn();
    await reachChristmasNight(slug);
    await advance(slug, cookie, 0);
    const response = await call(resetRoute, { slug }, { method: "DELETE", cookie, body: { reason: "reroll please" } });
    expect(await errorCode(response)).toBe("reveal_started");
  });

  it("opens only after the chain finishes, then verifies against the published hash", async () => {
    const { slug, cookie, people } = await drawn();
    const committed = (await lobby(slug)).commitmentHash!;
    await reachChristmasNight(slug);

    expect((await call(openSealRoute, { slug }, { cookie })).status).toBe(409);
    for (let step = 0; step <= people.length; step++) await advance(slug, cookie, step);
    expect((await call(openSealRoute, { slug }, { cookie })).status).toBe(200);

    const seal = await body<{ manifest: string; commitmentHash: string }>(await call(sealRoute, { slug }, { method: "GET" }));
    expect(seal.commitmentHash).toBe(committed);
    expect(await sha256HexInBrowser(seal.manifest)).toBe(committed);

    const manifest = parseManifest(seal.manifest);
    expect(manifest.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(isSingleLoop(manifest.assignments)).toBe(true);
  });

  it("opens the seal a day after Christmas Night even if the chain was skipped", async () => {
    const { slug, cookie } = await drawn();
    await client.query(`UPDATE exchanges SET reveal_at = now() - interval '25 hours' WHERE slug = $1`, [slug]);
    expect((await call(openSealRoute, { slug }, { cookie })).status).toBe(200);
  });

  it("publishes nothing through the seal route before opening", async () => {
    const { slug } = await drawn();
    const seal = await body<{ manifest: string | null }>(await call(sealRoute, { slug }, { method: "GET" }));
    expect(seal.manifest).toBeNull();
  });
});

describe("removing someone", () => {
  const remove = (slug: string, participantId: string, cookie?: string) => call(removeRoute, { slug, participantId }, { method: "DELETE", cookie });

  it("is for the organizer of that exchange only", async () => {
    const { slug, cookie, people } = await setUp();
    const other = await setUp();
    expect((await remove(slug, people[0].participantId)).status).toBe(401);
    expect((await remove(slug, other.people[0].participantId, cookie)).status).toBe(404);
    expect((await remove(slug, "not-a-uuid", cookie)).status).toBe(404);
    expect((await lobby(slug)).participants).toHaveLength(4);
    expect((await lobby(other.slug)).participants).toHaveLength(4);
  });

  it("takes them off the list, logs it publicly, stops their code, and keeps the record", async () => {
    const { slug, cookie, people } = await setUp();
    const [gone] = people;
    expect((await remove(slug, gone.participantId, cookie)).status).toBe(200);

    const view = await lobby(slug);
    expect(view.participants.map((p) => p.name)).toEqual(FOUR.slice(1));
    expect(view.audit[0]).toMatchObject({ event: "participant_removed", detail: `The organizer removed ${gone.name}` });

    const opened = await call(envelopeRoute, { slug }, { body: { participantId: gone.participantId, code: gone.elfCode } });
    expect(opened.status).toBe(401);
    expect((await call(reissueRoute, { slug, participantId: gone.participantId }, { cookie })).status).toBe(404);
    expect((await remove(slug, gone.participantId, cookie)).status).toBe(404);

    const [row] = await db.select().from(schema.participants).where(eq(schema.participants.id, gone.participantId));
    expect(row.removedAt).not.toBeNull();
    expect(await db.select().from(schema.wishlistItems).where(eq(schema.wishlistItems.participantId, gone.participantId))).toHaveLength(1);
  });

  it("lets the same name join again", async () => {
    const { slug, cookie, people } = await setUp();
    await remove(slug, people[0].participantId, cookie);
    const again = await join(slug, FOUR[0]);
    expect(again.participantId).not.toBe(people[0].participantId);
    expect((await lobby(slug)).participants.map((p) => p.name)).toContain(FOUR[0]);

    const duplicate = await call(participantsRoutes.POST, { slug }, { body: { ...nameFields(FOUR[0]), items: [item()] } });
    expect(await errorCode(duplicate)).toBe("name_taken");
  });

  it("drops their rules and leaves them out of the draw", async () => {
    const { slug, cookie, people } = await setUp();
    const [gone, partner, ...rest] = people;
    await call(exclusionsRoute, { slug }, { method: "PUT", body: { pairs: [[gone.participantId, partner.participantId]] }, cookie });
    expect((await remove(slug, gone.participantId, cookie)).status).toBe(200);

    const dashboard = await body<DashboardView>(await call(dashboardRoute, { slug }, { method: "GET", cookie }));
    expect(dashboard.exclusions).toEqual([]);
    expect(dashboard.participants).toHaveLength(3);

    expect((await call(poolRoute, { slug }, { body: { action: "lock" }, cookie })).status).toBe(200);
    expect((await call(drawRoute, { slug }, { cookie })).status).toBe(201);
    const results = await openAll(slug, [partner, ...rest]);
    expect(results.size).toBe(3);
    expect([...results.values()]).not.toContain(gone.name);
  });

  it("counts only the people left when deciding whether the draw can run", async () => {
    const { slug, cookie, people } = await setUp(FOUR.slice(0, 3));
    await remove(slug, people[0].participantId, cookie);
    expect((await call(poolRoute, { slug }, { body: { action: "lock" }, cookie })).status).toBe(422);
  });

  it("is refused after the draw until the draw is reset", async () => {
    const { slug, cookie, people } = await drawn();
    const refused = await remove(slug, people[0].participantId, cookie);
    expect(refused.status).toBe(409);
    expect(await errorCode(refused)).toBe("already_drawn");

    expect((await call(resetRoute, { slug }, { method: "DELETE", body: { reason: "test entry" }, cookie })).status).toBe(200);
    expect((await remove(slug, people[0].participantId, cookie)).status).toBe(200);
    expect((await call(drawRoute, { slug }, { cookie })).status).toBe(201);
    expect((await openAll(slug, people.slice(1))).size).toBe(3);
  });

  it("still can't be done by deleting rows", async () => {
    const { people } = await setUp();
    await expect(db.delete(schema.participants).where(eq(schema.participants.id, people[0].participantId))).rejects.toThrow();
  });
});

describe("rate limit bookkeeping", () => {
  it("starts a fresh window after the old one expires", async () => {
    const { slug, people } = await drawn();
    const { participantId, elfCode } = people[0];
    for (let i = 0; i < 7; i++) await call(envelopeRoute, { slug }, { body: { participantId, code: "wrong" } });

    await db
      .update(schema.rateLimits)
      .set({ windowEndsAt: sql`now() - interval '1 second'` })
      .where(and(eq(schema.rateLimits.key, `elf:${participantId}`)));

    expect((await call(envelopeRoute, { slug }, { body: { participantId, code: elfCode } })).status).toBe(200);
  });
});

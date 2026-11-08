import { PGlite } from "@electric-sql/pglite";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";
import { isSingleLoop, parseManifest, sha256HexInBrowser } from "@/lib/manifest";
import type { ChainView, DashboardView, EnvelopeView, LobbyView } from "@/lib/types";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));
vi.mock("@vercel/blob", () => ({
  put: async (pathname: string) => ({ url: `https://store.public.blob.vercel-storage.com/${pathname}` }),
}));

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
import { DELETE as resetRoute, POST as drawRoute } from "@/app/api/exchanges/[slug]/organizer/draw/route";
import { PUT as exclusionsRoute } from "@/app/api/exchanges/[slug]/organizer/exclusions/route";
import { POST as poolRoute } from "@/app/api/exchanges/[slug]/organizer/pool/route";
import { POST as openSealRoute } from "@/app/api/exchanges/[slug]/organizer/seal/route";
import { POST as uploadRoute } from "@/app/api/exchanges/[slug]/uploads/route";
import * as participantsRoutes from "@/app/api/exchanges/[slug]/participants/route";
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

async function join(slug: string, name: string, items = [item()]) {
  const response = await call(participantsRoutes.POST, { slug }, { body: { name, items } });
  expect(response.status).toBe(201);
  return body<{ participantId: string; name: string; elfCode: string }>(response);
}

async function setUp(names = ["Ana", "Ben", "Carla", "Dino"]) {
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
    expect(view.participants.map((p) => p.name)).toEqual(["Ana", "Ben", "Carla", "Dino"]);
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

  it("rejects duplicate names regardless of case and spacing", async () => {
    const { slug } = await setUp();
    const response = await call(participantsRoutes.POST, { slug }, { body: { name: "  ana ", items: [item()] } });
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("name_taken");
  });

  it("validates items, prices, and links", async () => {
    const { slug } = await createExchange();
    const submit = (items: unknown[]) => call(participantsRoutes.POST, { slug }, { body: { name: "Eli", items } });

    expect((await submit([])).status).toBe(422);
    expect((await submit([{ name: "Bag", priceCentavos: -5 }])).status).toBe(422);
    expect((await submit([{ name: "Bag", priceCentavos: 100, url: "javascript:alert(1)" }])).status).toBe(422);
    expect((await submit([{ name: "Bag", priceCentavos: 100, imageUrl: "https://evil.example/x.png" }])).status).toBe(422);
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
      .set({ displayName: "Someone Else" })
      .where(eq(schema.participants.id, people[0].participantId));
    await expect(rename).rejects.toThrow();
  });

  it("closes submissions when the pool locks", async () => {
    const { slug, cookie } = await setUp();
    await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });
    const response = await call(participantsRoutes.POST, { slug }, { body: { name: "Late", items: [item()] } });
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("pool_locked");
  });
});

describe("photo uploads", () => {
  const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4];

  function upload(slug: string, bytes: number[] | Uint8Array, claimedType = "image/jpeg") {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(bytes)], "photo", { type: claimedType }));
    const request = new Request("http://test.local/api", {
      method: "POST",
      body: form,
      headers: { "x-real-ip": `10.1.0.${++ipCounter}` },
    });
    return uploadRoute(request, { params: Promise.resolve({ slug }) });
  }

  function withBlobToken() {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  }

  it("says so plainly when uploads aren't configured", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const { slug } = await createExchange();
    const response = await upload(slug, JPEG);
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("uploads_unavailable");
    vi.unstubAllEnvs();
  });

  it("stores a real image and lets the wishlist use its URL", async () => {
    withBlobToken();
    const { slug } = await createExchange();
    const response = await upload(slug, JPEG);
    expect(response.status).toBe(201);
    const { url } = await body<{ url: string }>(response);

    const submit = await call(participantsRoutes.POST, { slug }, {
      body: { name: "Mia", items: [{ name: "Bag", priceCentavos: 100, imageUrl: url }] },
    });
    expect(submit.status).toBe(201);
    vi.unstubAllEnvs();
  });

  it("rejects a photo uploaded to a different exchange", async () => {
    withBlobToken();
    const first = await createExchange();
    const second = await createExchange();
    const { url } = await body<{ url: string }>(await upload(first.slug, JPEG));
    const submit = await call(participantsRoutes.POST, { slug: second.slug }, {
      body: { name: "Mia", items: [{ name: "Bag", priceCentavos: 100, imageUrl: url }] },
    });
    expect(await errorCode(submit)).toBe("invalid_image");
    vi.unstubAllEnvs();
  });

  it("judges a file by its bytes, not its claimed type", async () => {
    withBlobToken();
    const { slug } = await createExchange();
    expect((await upload(slug, [0x3c, 0x73, 0x76, 0x67, 1, 2, 3, 4, 5, 6, 7, 8], "image/png")).status).toBe(415);
    vi.unstubAllEnvs();
  });

  it("rejects oversized files", async () => {
    withBlobToken();
    const { slug } = await createExchange();
    const huge = new Uint8Array(1_500_001);
    huge.set(JPEG);
    expect((await upload(slug, huge)).status).toBe(413);
    vi.unstubAllEnvs();
  });

  it("closes uploads when the pool locks", async () => {
    withBlobToken();
    const { slug, cookie } = await setUp();
    await call(poolRoute, { slug }, { body: { action: "lock" }, cookie });
    expect((await upload(slug, JPEG)).status).toBe(409);
    vi.unstubAllEnvs();
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
    expect(Object.keys(view.participants[0]).sort()).toEqual(["codeReissuedAt", "hasOpened", "id", "itemCount", "name"]);
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
    const { slug, people } = await drawn(["Ana", "Ben", "Carla", "Dino", "Ella", "Fred"]);
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
    const { slug, cookie, people } = await setUp(["Ana", "Ben", "Carla", "Dino", "Ella", "Fred"]);
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
    expect(results.get("Ana")).not.toBe("Ben");
    expect(results.get("Ben")).not.toBe("Ana");
    expect(results.get("Carla")).not.toBe("Dino");
    expect(results.get("Dino")).not.toBe("Carla");
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
    const other = await setUp(["Xia", "Yul", "Zed"]);
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
    const loose = `  ${people[0].elfCode.replaceAll("-", " ").toUpperCase()} `;
    const response = await call(envelopeRoute, { slug }, { body: { participantId: people[0].participantId, code: loose } });
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
    expect(blocked.headers.get("retry-after")).toBeTruthy();
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

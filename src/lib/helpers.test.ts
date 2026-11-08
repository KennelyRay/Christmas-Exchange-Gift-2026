import { describe, expect, it } from "vitest";
import { defaultRevealAt, fromManilaInputValue, nextChristmas, timeParts, toManilaInputValue } from "./christmas";
import { buildManifest, isSingleLoop, parseManifest } from "./manifest";
import { formatPeso, parsePesoToCentavos } from "./money";
import { isWebUrl, normalizeWebUrl, storeNameFor } from "./stores";
import { fullNameOf, groupByFamily, nameKeyOf, normalizeNamePart } from "./names";
import { wishlistItemSchema, wishlistSubmissionSchema } from "./validation";
import { WORDS } from "./wordlist";
import { generateElfCode, generateOrganizerCode, generateSlug, hashCode, normalizeCode, verifyCode } from "@/server/codes";
import { createOrganizerToken, isValidOrganizerToken, seal, unseal } from "@/server/crypto";

describe("money", () => {
  it("formats pesos", () => {
    expect(formatPeso(129_900)).toBe("₱1,299");
    expect(formatPeso(129_950)).toBe("₱1,299.50");
  });

  it.each([
    ["1299", 129_900],
    ["1,299.50", 129_950],
    ["₱ 1,299", 129_900],
    ["PHP 500", 50_000],
    ["19.9", 1990],
    ["0.07", 7],
  ])("reads %s", (input, expected) => {
    expect(parsePesoToCentavos(input)).toBe(expected);
  });

  it.each(["", "abc", "12.345", "-5", "1e5"])("rejects %s", (input) => {
    expect(parsePesoToCentavos(input)).toBeNull();
  });
});

describe("store links", () => {
  it.each([
    ["https://shopee.ph/product/123", "Shopee"],
    ["https://s.shopee.ph/abc", "Shopee"],
    ["https://www.lazada.com.ph/products/x.html", "Lazada"],
    ["https://shop.example.com/x", "shop.example.com"],
  ])("labels %s", (url, expected) => {
    expect(storeNameFor(url)).toBe(expected);
  });

  it("does not match lookalike hosts", () => {
    expect(storeNameFor("https://notshopee.ph/x")).toBe("notshopee.ph");
  });

  it("accepts only web links", () => {
    expect(isWebUrl("https://shopee.ph/x")).toBe(true);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("data:text/html,hi")).toBe(false);
    expect(isWebUrl("not a url")).toBe(false);
  });

  it("adds a missing https prefix but leaves other schemes for validation to reject", () => {
    expect(normalizeWebUrl(" shopee.ph/x ")).toBe("https://shopee.ph/x");
    expect(normalizeWebUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
  });

  it("validates optional links on items", () => {
    expect(wishlistItemSchema.safeParse({ name: "A", priceCentavos: 1, url: null }).success).toBe(true);
    expect(wishlistItemSchema.safeParse({ name: "A", priceCentavos: 1, url: "ftp://x.y" }).success).toBe(false);
  });
});

describe("dates", () => {
  it("counts down to midnight on 25 December in Manila", () => {
    expect(nextChristmas(new Date("2026-11-08T00:00:00Z")).toISOString()).toBe("2026-12-24T16:00:00.000Z");
  });

  it("keeps Christmas Day as today, then rolls to next year", () => {
    expect(nextChristmas(new Date("2026-12-25T10:00:00Z")).toISOString()).toBe("2026-12-24T16:00:00.000Z");
    expect(nextChristmas(new Date("2026-12-25T16:30:00Z")).toISOString()).toBe("2027-12-24T16:00:00.000Z");
  });

  it("defaults Christmas Night to 8 PM Noche Buena in Manila", () => {
    expect(defaultRevealAt(new Date("2026-11-08T00:00:00Z")).toISOString()).toBe("2026-12-24T12:00:00.000Z");
  });

  it("rolls Christmas Night forward once it has passed", () => {
    expect(defaultRevealAt(new Date("2026-12-24T13:00:00Z")).toISOString()).toBe("2027-12-24T12:00:00.000Z");
  });

  it("round-trips Manila input values", () => {
    const iso = "2026-12-24T12:00:00.000Z";
    expect(toManilaInputValue(iso)).toBe("2026-12-24T20:00");
    expect(fromManilaInputValue("2026-12-24T20:00").toISOString()).toBe(iso);
  });

  it("splits durations and never goes negative", () => {
    expect(timeParts(90_061_000)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
    expect(timeParts(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe("names", () => {
  it.each([
    ["Dela Cruz", "dela  cruz"],
    [" DELA CRUZ ", "dela cruz"],
    ["Peña", "pena"],
    ["José", "JOSE"],
    ["Nguyễn", "nguyen"],
    ["Dela Cruz", "dela cruz"],
  ])("treats %j and %j as the same", (a, b) => {
    expect(normalizeNamePart(a)).toBe(normalizeNamePart(b));
  });

  it("keeps genuinely different spellings apart", () => {
    expect(normalizeNamePart("De la Cruz")).not.toBe(normalizeNamePart("Dela Cruz"));
  });

  it("compares the whole name, however it was split", () => {
    expect(nameKeyOf("Mary Ann", "Cruz")).toBe(nameKeyOf("Mary", "Ann Cruz"));
    expect(nameKeyOf("José", "dela  Cruz")).toBe(nameKeyOf("JOSE", "Dela Cruz"));
  });

  it("shows the full name", () => {
    expect(fullNameOf("Ana", "Dela Cruz")).toBe("Ana Dela Cruz");
  });

  it("groups people by family, in join order, labelled by the first spelling", () => {
    const person = (id: string, lastName: string) => ({ id, lastName, familyKey: normalizeNamePart(lastName) });
    const families = groupByFamily([person("a", "Dela Cruz"), person("b", "Lim"), person("c", "dela  cruz")]);
    expect(families.map((f) => [f.label, f.members.map((m) => m.id)])).toEqual([
      ["Dela Cruz", ["a", "c"]],
      ["Lim", ["b"]],
    ]);
  });
});

describe("wishlist submission names", () => {
  const items = [{ name: "A", priceCentavos: 100 }];
  const parse = (firstName: unknown, lastName: unknown) => wishlistSubmissionSchema.safeParse({ firstName, lastName, items });

  it("requires both names", () => {
    expect(parse("", "Cruz").success).toBe(false);
    expect(parse("Ana", "").success).toBe(false);
    expect(parse("   ", "Cruz").success).toBe(false);
    expect(parse("Ana", "   ").success).toBe(false);
    expect(parse(undefined, "Cruz").success).toBe(false);
    expect(parse("Ana", undefined).success).toBe(false);
  });

  it("cleans up spacing but keeps the person's own spelling", () => {
    const result = wishlistSubmissionSchema.parse({ firstName: "  José ", lastName: " Dela   Cruz", items });
    expect([result.firstName, result.lastName]).toEqual(["José", "Dela Cruz"]);
  });

  it("limits length and rejects names with no letters", () => {
    expect(parse("A".repeat(41), "Cruz").success).toBe(false);
    expect(parse("Ana", "L".repeat(41)).success).toBe(false);
    expect(parse("123", "Cruz").success).toBe(false);
    expect(parse("Ana", "---").success).toBe(false);
  });
});

describe("codes", () => {
  it("draws from 256 unique lowercase words", () => {
    expect(WORDS).toHaveLength(256);
    expect(new Set(WORDS).size).toBe(256);
    expect(WORDS.every((word) => /^[a-z]+$/.test(word))).toBe(true);
  });

  it("generates codes of the right shape", () => {
    expect(generateElfCode()).toMatch(/^[a-z]+(-[a-z]+){3}$/);
    expect(generateOrganizerCode()).toMatch(/^[a-z]+(-[a-z]+){5}$/);
    expect(generateSlug()).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
  });

  it("verifies a loosely typed code against its hash", async () => {
    const hash = await hashCode("snow-frost-holly-ivy");
    expect(hash).not.toContain("snow");
    expect(await verifyCode(" Snow FROST  holly\nivy ", hash)).toBe(true);
    expect(await verifyCode("snow-frost-holly-pine", hash)).toBe(false);
    expect(normalizeCode("a b")).toBe("a-b");
  });
});

describe("typing a code however feels natural", () => {
  const code = "snow-frost-holly-ivy";
  const organizerCode = "santa-pear-noche-honey-cocoa-ivy";

  it.each([
    "snowfrosthollyivy",
    "SNOWFROSTHOLLYIVY",
    "snow frost holly ivy",
    "snow,frost.holly/ivy",
    "snowfrost hollyivy",
    "snow · frost · holly · ivy",
    " snow-frost-holly-ivy ",
  ])("accepts %j", async (typed) => {
    expect(await verifyCode(typed, await hashCode(code))).toBe(true);
  });

  it("accepts a six-word Organizer Code typed with no separators", async () => {
    expect(await verifyCode("santapearnochehoneycocoaivy", await hashCode(organizerCode))).toBe(true);
  });

  it("still accepts hashes made from the dashed form", async () => {
    const hash = await hashCode("snow frost holly ivy");
    expect(await verifyCode("snowfrosthollyivy", hash)).toBe(true);
  });

  it.each(["snowfrosthollypine", "snowfrostholly", "snowfrosthollyivyivy", "xxsnowfrosthollyivy", "ivyhollyfrostsnow", ""])(
    "still rejects %j",
    async (typed) => {
      expect(await verifyCode(typed, await hashCode(code))).toBe(false);
    },
  );

  it("backs up when a longer word is a false start", async () => {
    // "pearl" is also a code word, but only "pear" + "lace" leaves valid letters.
    const hash = await hashCode("pear-lace-fig-ivy");
    expect(await verifyCode("pearlacefigivy", hash)).toBe(true);
  });
});

describe("sealing", () => {
  it("round-trips with the right context", () => {
    expect(unseal(seal("secret", "row-1"), "row-1")).toBe("secret");
  });

  it("refuses a ciphertext moved to another row", () => {
    expect(() => unseal(seal("secret", "row-1"), "row-2")).toThrow();
  });

  it("refuses tampered ciphertext", () => {
    const sealed = seal("secret", "row-1");
    const [iv, body, tag] = sealed.split(".");
    const flipped = Buffer.from(body, "base64url");
    flipped[0] ^= 1;
    expect(() => unseal([iv, flipped.toString("base64url"), tag].join("."), "row-1")).toThrow();
  });

  it("never produces the same ciphertext twice", () => {
    expect(seal("secret", "row-1")).not.toBe(seal("secret", "row-1"));
  });
});

describe("organizer tokens", () => {
  it("accepts a valid token only for its own exchange", () => {
    const token = createOrganizerToken("exchange-a", 60);
    expect(isValidOrganizerToken(token, "exchange-a")).toBe(true);
    expect(isValidOrganizerToken(token, "exchange-b")).toBe(false);
  });

  it("rejects expired, forged, and missing tokens", () => {
    expect(isValidOrganizerToken(createOrganizerToken("a", -10), "a")).toBe(false);
    expect(isValidOrganizerToken("9999999999.forged", "a")).toBe(false);
    expect(isValidOrganizerToken(undefined, "a")).toBe(false);
  });
});

describe("manifest", () => {
  it("closes the loop back to the first giver", () => {
    const { assignments } = parseManifest(buildManifest("x", "salt", ["A", "B", "C"]));
    expect(assignments).toEqual([
      { giver: "A", recipient: "B" },
      { giver: "B", recipient: "C" },
      { giver: "C", recipient: "A" },
    ]);
    expect(isSingleLoop(assignments)).toBe(true);
  });

  it("rejects two separate loops and self-picks", () => {
    expect(
      isSingleLoop([
        { giver: "A", recipient: "B" },
        { giver: "B", recipient: "A" },
        { giver: "C", recipient: "D" },
        { giver: "D", recipient: "C" },
      ]),
    ).toBe(false);
    expect(isSingleLoop([{ giver: "A", recipient: "A" }])).toBe(false);
  });
});

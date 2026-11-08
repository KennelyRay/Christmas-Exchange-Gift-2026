import { z } from "zod";
import { isWebUrl } from "./stores";

export const MAX_ITEMS = 20;
export const MAX_PARTICIPANTS = 100;
const MAX_PRICE_CENTAVOS = 100_000_000;

const plainText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long (${max} characters at most)`)
    .regex(/^[^\p{Cc}\p{Cf}]*$/u, `${label} contains characters we can't store`);

const centavos = z
  .number()
  .int("Enter a valid amount")
  .positive("Amount must be more than zero")
  .max(MAX_PRICE_CENTAVOS, "That amount is too high");

const webUrl = z.string().trim().max(2048, "That link is too long").refine(isWebUrl, {
  message: "Enter a full web link, like https://shopee.ph/...",
});

const secretCode = z.string().trim().min(1, "Enter your code").max(120, "That code is too long");

export const createExchangeSchema = z.object({
  name: plainText("Exchange name", 60),
  budgetCentavos: centavos.nullable().optional(),
  revealAt: z.iso.datetime({ offset: true }).optional(),
});

export const wishlistItemSchema = z.object({
  name: plainText("Item name", 120),
  priceCentavos: centavos,
  url: webUrl.nullable().optional(),
  imageUrl: z.string().url().max(2048).nullable().optional(),
});

const personName = (label: string) =>
  plainText(label, 40)
    .regex(/\p{L}/u, `${label} needs at least one letter`)
    .transform((value) => value.replace(/\s+/g, " "));

export const wishlistSubmissionSchema = z.object({
  firstName: personName("First name"),
  lastName: personName("Last name"),
  items: z
    .array(wishlistItemSchema)
    .min(1, "Add at least one item")
    .max(MAX_ITEMS, `Keep it to ${MAX_ITEMS} items`),
});

export const envelopeSchema = z.object({
  participantId: z.uuid("Pick your name"),
  code: secretCode,
});

export const organizerLoginSchema = z.object({ code: secretCode });

export const organizerSettingsSchema = z
  .object({
    budgetCentavos: centavos.nullable().optional(),
    revealAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => v.budgetCentavos !== undefined || v.revealAt !== undefined, {
    message: "Nothing to change",
  });

export const poolActionSchema = z.object({ action: z.enum(["lock", "reopen"]) });

export const exclusionsSchema = z.object({
  pairs: z.array(z.tuple([z.uuid(), z.uuid()])).max(1000, "That's too many rules"),
});

export const resetDrawSchema = z.object({
  reason: plainText("Reason", 200).min(3, "Tell everyone why the draw is being reset"),
});

export const advanceChainSchema = z.object({ expectedStep: z.number().int().min(0) });

export type WishlistSubmission = z.infer<typeof wishlistSubmissionSchema>;

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { exchanges } from "@/db/schema";
import { chainNamesOf, parseManifest } from "@/lib/manifest";
import type { ChainView } from "@/lib/types";
import { unseal } from "./crypto";
import { manifestContext } from "./draw";
import { addAudit, requireExchange, type Exchange } from "./exchanges";
import { ApiError } from "./http";

function chainNames(exchange: Exchange) {
  if (!exchange.sealedManifest) throw new Error(`Exchange ${exchange.id} has no sealed manifest`);
  const text = unseal(exchange.sealedManifest, manifestContext(exchange.id, exchange.drawGeneration));
  return chainNamesOf(parseManifest(text));
}

export const hasRevealArrived = (exchange: Exchange) => exchange.revealAt.getTime() <= Date.now();

/**
 * The browser only ever receives the people revealed so far, so reading the
 * page source or the network tab cannot spoil the next link.
 */
export function getChainView(exchange: Exchange): ChainView {
  const revealAt = exchange.revealAt.toISOString();
  if (exchange.status !== "drawn") return { state: "not_drawn", revealAt };
  if (!hasRevealArrived(exchange)) return { state: "sealed", revealAt };

  const names = chainNames(exchange);
  const loop = [...names, names[0]];
  return {
    state: "live",
    step: exchange.chainStep,
    totalSteps: loop.length,
    sequence: loop.slice(0, exchange.chainStep),
    // Sorted so the slot reel's order gives nothing away.
    names: [...names].sort((a, b) => a.localeCompare(b)),
  };
}

export async function advanceChain(exchange: Exchange, expectedStep: number) {
  const view = getChainView(exchange);
  if (view.state === "not_drawn") throw new ApiError(409, "not_drawn", "The draw hasn't happened yet.");
  if (view.state === "sealed") throw new ApiError(409, "still_sealed", "The chain stays sealed until Christmas Night.");

  // A stale or double press is a no-op, so a jittery remote can't skip a link.
  if (expectedStep !== exchange.chainStep || exchange.chainStep >= view.totalSteps) return view;

  await getDb().transaction(async (tx) => {
    const updated = await tx
      .update(exchanges)
      .set({ chainStep: expectedStep + 1 })
      .where(and(eq(exchanges.id, exchange.id), eq(exchanges.chainStep, expectedStep)))
      .returning({ id: exchanges.id });

    if (updated.length > 0 && expectedStep === 0) {
      await addAudit(tx, exchange.id, "chain_started", "The Gift Chain reveal began");
    }
  });

  return getChainView(await requireExchange(exchange.slug));
}

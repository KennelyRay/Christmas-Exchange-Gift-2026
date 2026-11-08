import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { GiftChain } from "@/components/gift-chain";
import { getChainView } from "@/server/chain";
import { findExchange } from "@/server/exchanges";
import { hasOrganizerSession } from "@/server/organizer";

export default async function ChainPage({ params }: PageProps<"/x/[slug]/chain">) {
  const { slug } = await params;
  const exchange = await findExchange(slug);
  if (!exchange) notFound();

  return (
    <GiftChain
      slug={slug}
      initial={getChainView(exchange)}
      isOrganizer={hasOrganizerSession(exchange, await cookies())}
    />
  );
}

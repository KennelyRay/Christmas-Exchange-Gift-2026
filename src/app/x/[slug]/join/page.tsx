import { notFound } from "next/navigation";
import { JoinClosed } from "@/components/join-closed";
import { WishlistFormLoader } from "@/components/wishlist-form-loader";
import { findExchange } from "@/server/exchanges";

export default async function JoinPage({ params }: PageProps<"/x/[slug]/join">) {
  const { slug } = await params;
  const exchange = await findExchange(slug);
  if (!exchange) notFound();

  return exchange.status === "open" ? (
    <WishlistFormLoader slug={slug} exchangeId={exchange.id} budgetCentavos={exchange.budgetHintCentavos} exchangeName={exchange.name} />
  ) : (
    <JoinClosed slug={slug} name={exchange.name} />
  );
}

import { notFound } from "next/navigation";
import { WishlistFormLoader } from "@/components/wishlist-form-loader";
import { LinkButton, PageShell } from "@/components/ui";
import { findExchange } from "@/server/exchanges";

export default async function JoinPage({ params }: PageProps<"/x/[slug]/join">) {
  const { slug } = await params;
  const exchange = await findExchange(slug);
  if (!exchange) notFound();

  return (
    <PageShell slug={slug} narrow>
      {exchange.status === "open" ? (
        <WishlistFormLoader slug={slug} budgetCentavos={exchange.budgetHintCentavos} />
      ) : (
        <>
          <h1 className="font-display text-4xl font-semibold">The pool is locked</h1>
          <p className="mt-3 mb-8 text-snow/85">
            New wishlists are closed for {exchange.name}. If you were meant to join, ask the organizer to reopen the pool.
          </p>
          <LinkButton href={`/x/${slug}`} variant="gold">
            See who&apos;s in
          </LinkButton>
        </>
      )}
    </PageShell>
  );
}

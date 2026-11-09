import { notFound } from "next/navigation";
import { EnvelopeClient } from "@/components/envelope";
import { EnvelopeFrame } from "@/components/mobile-shell";
import { PageShell } from "@/components/ui";
import { findExchange, getLobby } from "@/server/exchanges";

export default async function EnvelopePage({ params }: PageProps<"/x/[slug]/envelope">) {
  const { slug } = await params;
  const exchange = await findExchange(slug);
  if (!exchange) notFound();

  const { participants } = await getLobby(exchange);

  return (
    <EnvelopeFrame slug={slug}>
      <PageShell slug={slug} narrow backOnWideOnly>
        <EnvelopeClient slug={slug} participants={participants} />
      </PageShell>
    </EnvelopeFrame>
  );
}

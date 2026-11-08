import { notFound } from "next/navigation";
import { SealCheck } from "@/components/seal-check";
import { PageShell } from "@/components/ui";
import { findExchange, getSeal } from "@/server/exchanges";

export default async function SealPage({ params }: PageProps<"/x/[slug]/seal">) {
  const { slug } = await params;
  const exchange = await findExchange(slug);
  if (!exchange) notFound();

  return (
    <PageShell slug={slug} narrow>
      <SealCheck seal={getSeal(exchange)} />
    </PageShell>
  );
}

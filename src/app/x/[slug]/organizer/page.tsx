import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OrganizerClient } from "@/components/organizer";
import { PageShell } from "@/components/ui";
import { findExchange } from "@/server/exchanges";
import { getDashboard, hasOrganizerSession } from "@/server/organizer";

export default async function OrganizerPage({ params }: PageProps<"/x/[slug]/organizer">) {
  const { slug } = await params;
  const exchange = await findExchange(slug);
  if (!exchange) notFound();

  const signedIn = hasOrganizerSession(exchange, await cookies());

  return (
    <PageShell slug={slug} narrow>
      <OrganizerClient slug={slug} initial={signedIn ? await getDashboard(exchange) : null} />
    </PageShell>
  );
}

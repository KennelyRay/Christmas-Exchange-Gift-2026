import { notFound } from "next/navigation";
import { Lobby } from "@/components/lobby";
import { findExchange, getLobby } from "@/server/exchanges";

export default async function LobbyPage({ params }: PageProps<"/x/[slug]">) {
  const { slug } = await params;
  const exchange = await findExchange(slug);
  if (!exchange) notFound();

  return <Lobby initial={await getLobby(exchange)} />;
}

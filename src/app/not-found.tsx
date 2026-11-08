import { LinkButton, PageShell } from "@/components/ui";

export default function NotFound() {
  return (
    <PageShell narrow>
      <h1 className="font-display text-4xl font-semibold">This one got lost in the snow</h1>
      <p className="mt-3 mb-8 text-snow/85">We couldn&apos;t find that exchange. Check the link your family sent you.</p>
      <LinkButton href="/" variant="gold">
        Go to the start
      </LinkButton>
    </PageShell>
  );
}

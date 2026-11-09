"use client";

import { Button, PageShell } from "@/components/ui";

export default function ErrorPage({ unstable_retry: retry }: { unstable_retry: () => void }) {
  return (
    <PageShell narrow>
      <h1 className="font-display text-4xl font-semibold">The sleigh hit a snag</h1>
      <p className="mt-3 mb-8 text-snow-soft">Something went wrong on our side. Your wishlist and the draw are safe.</p>
      <Button variant="gold" onClick={retry}>
        Try again
      </Button>
    </PageShell>
  );
}

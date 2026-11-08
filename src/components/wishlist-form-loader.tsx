"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "./ui";

// Client-only because the form starts from a draft saved in this browser.
export const WishlistFormLoader = dynamic(() => import("./wishlist-form").then((m) => m.WishlistForm), {
  ssr: false,
  loading: () => (
    <div role="status" aria-label="Loading your wishlist" className="grid gap-4">
      <Skeleton className="h-14 w-3/4" />
      <Skeleton className="h-28 w-full rounded-[2rem]" />
      <Skeleton className="h-96 w-full rounded-[2rem]" />
    </div>
  ),
});

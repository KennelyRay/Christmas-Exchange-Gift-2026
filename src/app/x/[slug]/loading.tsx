import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto grid w-full max-w-6xl gap-6 px-4 pt-20 pb-16 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="grid gap-4">
        <Skeleton className="h-14 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-64 w-full rounded-[2rem]" />
      </div>
      <Skeleton className="h-80 w-full rounded-[2rem]" />
    </div>
  );
}

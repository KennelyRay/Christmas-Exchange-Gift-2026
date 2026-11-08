import { ArrowSquareOutIcon, StorefrontIcon } from "@phosphor-icons/react";
import { storeNameFor } from "@/lib/stores";

export function StoreChip({ url, linked }: { url: string; linked?: boolean }) {
  const store = storeNameFor(url);
  if (!store) return null;

  const content = (
    <>
      <StorefrontIcon aria-hidden size={16} className="shrink-0" />
      <span className="truncate">{store}</span>
      {linked && <ArrowSquareOutIcon aria-hidden size={16} className="shrink-0" />}
    </>
  );
  const chipClass = "inline-flex min-h-9 w-fit max-w-full items-center gap-1.5 rounded-full bg-pine-800 px-3.5 text-sm font-semibold text-snow";

  if (!linked) return <span className={chipClass}>{content}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className={`${chipClass} transition duration-200 ease-settle hover:bg-pine-700 active:scale-[0.98]`}>
      {content}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

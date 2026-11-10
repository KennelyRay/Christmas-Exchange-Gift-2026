"use client";

import { GiftIcon, XIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "./ui";

type ItemPhotoProps = {
  src: string;
  /** The item name. */
  alt: string;
  /** Tells next/image which width to fetch, e.g. "(min-width: 768px) 12rem, 100vw". */
  sizes: string;
  /** Size and corner rounding of the frame. */
  className?: string;
  fit?: "cover" | "contain";
  /** Tapping opens the photo full screen. */
  zoomable?: boolean;
};

function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={alt}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-pine-950 p-0 text-snow backdrop:bg-pine-950"
    >
      <div className="safe-x safe-top safe-bottom flex h-full flex-col gap-4">
        <div className="relative min-h-0 flex-1">
          <Image src={src} alt={alt} fill sizes="100vw" className="object-contain" />
        </div>
        <Button variant="gold" onClick={onClose} className="w-full shrink-0 md:mx-auto md:w-auto">
          <XIcon aria-hidden size={24} className="shrink-0" />
          {t("photo.close")}
        </Button>
      </div>
    </dialog>
  );
}

/**
 * A wishlist photo. The cream frame shows while it loads, and a gift box takes
 * its place if it can't load, so a broken-image icon never appears.
 */
export function ItemPhoto({ src, alt, sizes, className = "", fit = "cover", zoomable }: ItemPhotoProps) {
  const t = useT();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const frame = `relative overflow-hidden bg-paper-deep ${className}`;

  if (failedSrc === src) {
    return (
      <div role="img" aria-label={alt} className={`${frame} grid place-items-center`}>
        <GiftIcon aria-hidden size={48} weight="duotone" className="text-wax-deep/70" />
      </div>
    );
  }

  const picture = (
    <Image src={src} alt={alt} fill sizes={sizes} className={fit === "cover" ? "object-cover" : "object-contain"} onError={() => setFailedSrc(src)} />
  );

  if (!zoomable) return <div className={frame}>{picture}</div>;

  return (
    <>
      <button type="button" onClick={() => setViewing(true)} aria-label={t("photo.view", { name: alt })} className={`${frame} block cursor-zoom-in`}>
        {picture}
      </button>
      {viewing && <PhotoViewer src={src} alt={alt} onClose={() => setViewing(false)} />}
    </>
  );
}

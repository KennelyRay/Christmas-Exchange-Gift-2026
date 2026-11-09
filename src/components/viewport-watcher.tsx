"use client";

import { useEffect } from "react";
import { htmlLang, useLocale } from "@/lib/i18n";

/** At 24px a rem is 150% of normal, the point where pinned bars start crowding the page. */
const BIG_TEXT_PX = 24;
/** No browser bar is this tall, so a drop this size can only be the on-screen keyboard. */
const KEYBOARD_MIN_PX = 150;
const ZOOMED_IN = 1.01;

/** Page-wide facts CSS can't see for itself. Renders nothing. */
export function ViewportWatcher() {
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
  }, [locale]);

  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let fullHeight = 0;
    let fullWidth = 0;

    const update = () => {
      root.toggleAttribute("data-big-text", parseFloat(getComputedStyle(root).fontSize) >= BIG_TEXT_PX);

      // Pinch-zooming also shrinks the visual viewport, and must not move the bars.
      const zoomed = (viewport?.scale ?? 1) > ZOOMED_IN;
      const height = viewport?.height ?? window.innerHeight;
      if (window.innerWidth !== fullWidth) {
        fullWidth = window.innerWidth;
        fullHeight = height;
      } else if (!zoomed) {
        fullHeight = Math.max(fullHeight, height);
      }

      // Watches the keyboard itself, not input focus. Focus is lost the moment a button
      // is pressed, and moving the page mid-press makes the browser drop the tap.
      root.toggleAttribute("data-keyboard-open", !zoomed && fullHeight - height > KEYBOARD_MIN_PX);

      if (viewport) {
        const covered = zoomed ? 0 : Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        root.style.setProperty("--keyboard-offset", `${Math.round(covered)}px`);
      }
    };

    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, []);

  return null;
}

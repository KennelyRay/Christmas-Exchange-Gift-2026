"use client";

import { useEffect, useRef } from "react";

type Flake = { x: number; y: number; radius: number; speed: number; sway: number; phase: number };

const PHONE_WIDTH = 768;
const FRAME_MS_ON_PHONE = 1000 / 30;

/** Cheap phones get fewer flakes, a 1x canvas, and half the frames. */
function flakeCount(width: number) {
  return width < PHONE_WIDTH ? Math.round(Math.min(24, width / 16)) : Math.round(Math.min(90, width / 14));
}

export function Snowfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let flakes: Flake[] = [];
    let frame = 0;
    let lastDrawn = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      // A phone's address bar sliding away only changes the height. Don't reshuffle for that.
      const widthChanged = window.innerWidth !== width;
      width = window.innerWidth;
      height = window.innerHeight;

      const ratio = width < PHONE_WIDTH ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (!widthChanged) return;
      flakes = Array.from({ length: flakeCount(width) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.8 + Math.random() * 2.2,
        speed: 0.25 + Math.random() * 0.8,
        sway: 0.2 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      const budget = width < PHONE_WIDTH ? FRAME_MS_ON_PHONE : 0;
      if (time - lastDrawn < budget) return;
      // Keeps the fall the same speed at 30 frames as at 60.
      const steps = budget ? 2 : 1;
      lastDrawn = time;

      context.clearRect(0, 0, width, height);
      context.fillStyle = "rgba(247, 243, 234, 0.6)";
      context.beginPath();
      for (const flake of flakes) {
        flake.y += flake.speed * steps;
        flake.phase += 0.01 * steps;
        flake.x += Math.sin(flake.phase) * flake.sway * steps;
        if (flake.y > height + 4) {
          flake.y = -4;
          flake.x = Math.random() * width;
        }
        context.moveTo(flake.x + flake.radius, flake.y);
        context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      }
      context.fill();
    };

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === "visible") frame = requestAnimationFrame(draw);
    };

    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 h-full w-full" />;
}

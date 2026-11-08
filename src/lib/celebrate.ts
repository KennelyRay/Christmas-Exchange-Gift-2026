import confetti from "canvas-confetti";

const COLORS = ["#a3262b", "#e0bb6b", "#1f5443", "#f7f3ea"];

export function burst(intensity = 1) {
  void confetti({
    particleCount: Math.round(90 * intensity),
    spread: 85,
    startVelocity: 42,
    origin: { y: 0.55 },
    colors: COLORS,
    disableForReducedMotion: true,
  });
}

export function finale() {
  burst(1.6);
  setTimeout(() => {
    void confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0 }, colors: COLORS, disableForReducedMotion: true });
    void confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1 }, colors: COLORS, disableForReducedMotion: true });
  }, 350);
}

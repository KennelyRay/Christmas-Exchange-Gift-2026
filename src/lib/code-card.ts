const WIDTH = 1080;
const HEIGHT = 1350;
const CARD_MARGIN = 72;
const INNER_WIDTH = WIDTH - CARD_MARGIN * 2 - 120;

type CodeCard = { code: string; label: string; note: string; name?: string; exchangeName?: string };

function fontStack(variable: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

export const groupCode = (code: string) => (/^\d+$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code.split("-").join(" · "));

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrinks until the text fits, so a long name or word code never runs off the card. */
function fitFont(context: CanvasRenderingContext2D, text: string, weight: number, family: string, start: number, maxLines: number) {
  let size = start;
  while (size > 28) {
    context.font = `${weight} ${size}px ${family}`;
    if (wrapLines(context, text, INNER_WIDTH).length <= maxLines) break;
    size -= 4;
  }
  return size;
}

function drawCentered(context: CanvasRenderingContext2D, text: string, y: number, lineHeight: number) {
  const lines = wrapLines(context, text, INNER_WIDTH);
  lines.forEach((line, index) => context.fillText(line, WIDTH / 2, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function drawBackground(context: CanvasRenderingContext2D) {
  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#1f5443");
  gradient.addColorStop(1, "#0b231c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = "rgba(247, 243, 234, 0.7)";
  context.beginPath();
  for (let flake = 0; flake < 70; flake++) {
    // Fixed positions from the index, so nothing depends on randomness.
    const x = (flake * 317) % WIDTH;
    const y = (flake * 191) % HEIGHT;
    const radius = 2 + (flake % 4);
    context.moveTo(x + radius, y);
    context.arc(x, y, radius, 0, Math.PI * 2);
  }
  context.fill();
}

function drawStar(context: CanvasRenderingContext2D, cx: number, cy: number) {
  const points = [
    [0, -62],
    [14, -14],
    [62, 0],
    [14, 14],
    [0, 62],
    [-14, 14],
    [-62, 0],
    [-14, -14],
  ];
  context.fillStyle = "#a3262b";
  context.beginPath();
  context.arc(cx, cy, 84, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#e0bb6b";
  context.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? context.moveTo(cx + x, cy + y) : context.lineTo(cx + x, cy + y)));
  context.closePath();
  context.fill();
}

/** Draws the keepsake on a canvas in the browser. The code never leaves this device. */
export async function renderCodeCard({ code, label, note, name, exchangeName }: CodeCard) {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't draw pictures.");

  const display = fontStack("--font-fraunces", "Georgia, serif");
  const sans = fontStack("--font-jakarta", "Arial, sans-serif");

  drawBackground(context);

  context.fillStyle = "#fbf4e6";
  context.beginPath();
  context.roundRect(CARD_MARGIN, CARD_MARGIN, WIDTH - CARD_MARGIN * 2, HEIGHT - CARD_MARGIN * 2, 56);
  context.fill();

  drawStar(context, WIDTH / 2, 216);

  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  let y = 370;

  if (exchangeName) {
    context.fillStyle = "#4d3a2c";
    context.font = `600 ${fitFont(context, exchangeName, 600, sans, 40, 2)}px ${sans}`;
    y = drawCentered(context, exchangeName, y, 52) + 28;
  }

  if (name) {
    context.fillStyle = "#2a1c13";
    const size = fitFont(context, name, 600, display, 76, 2);
    context.font = `600 ${size}px ${display}`;
    y = drawCentered(context, name, y + size * 0.5, size * 1.15) + 24;
  }

  context.fillStyle = "#7d1a20";
  context.font = `700 ${fitFont(context, label, 700, sans, 44, 2)}px ${sans}`;
  y = drawCentered(context, label, y + 40, 56);

  const shown = groupCode(code);
  const panelTop = y + 12;
  const panelHeight = 320;
  context.fillStyle = "rgba(224, 187, 107, 0.4)";
  context.strokeStyle = "#80590f";
  context.lineWidth = 5;
  context.setLineDash([18, 14]);
  context.beginPath();
  context.roundRect(CARD_MARGIN + 44, panelTop, WIDTH - (CARD_MARGIN + 44) * 2, panelHeight, 40);
  context.fill();
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#2a1c13";
  const codeSize = fitFont(context, shown, 700, display, /^\d/.test(code) ? 168 : 76, /^\d/.test(code) ? 1 : 3);
  context.font = `700 ${codeSize}px ${display}`;
  const codeLines = wrapLines(context, shown, INNER_WIDTH);
  const lineHeight = codeSize * 1.15;
  const firstBaseline = panelTop + panelHeight / 2 - ((codeLines.length - 1) * lineHeight) / 2 + codeSize * 0.34;
  codeLines.forEach((line, index) => context.fillText(line, WIDTH / 2, firstBaseline + index * lineHeight));

  context.fillStyle = "#2a1c13";
  context.font = `600 40px ${sans}`;
  drawCentered(context, note, panelTop + panelHeight + 76, 54);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser can't save pictures.");
  return { blob, dataUrl: canvas.toDataURL("image/png") };
}

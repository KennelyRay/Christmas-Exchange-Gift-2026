const peso = (fractionDigits: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2,
  });

const wholePeso = peso(0);
const exactPeso = peso(2);

export function formatPeso(centavos: number) {
  return (centavos % 100 === 0 ? wholePeso : exactPeso).format(centavos / 100);
}

/** Reads what people actually type: "1299", "1,299.50", "₱ 1,299". Null if invalid. */
export function parsePesoToCentavos(input: string): number | null {
  const cleaned = input.replace(/[₱\s,]/g, "").replace(/^(php|p)/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const centavos = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

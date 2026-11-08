import type { ApiErrorBody } from "./types";

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; form?: FormData } = {}) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (options.body !== undefined || options.form ? "POST" : "GET"),
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      cache: "no-store",
    });
  } catch {
    throw new ClientApiError(0, "network", "We can't reach the North Pole right now. Check your connection and try again.");
  }

  if (response.ok) return (await response.json()) as T;

  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  throw new ClientApiError(
    response.status,
    body?.error.code ?? "unknown",
    body?.error.message ?? "Something went wrong. Please try again.",
    body?.error.fields,
  );
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

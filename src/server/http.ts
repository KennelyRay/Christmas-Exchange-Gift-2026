import { z } from "zod";
import type { ApiErrorBody } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, fields: error.fields },
    };
    const headers = error.retryAfterSeconds
      ? { "Retry-After": String(error.retryAfterSeconds) }
      : undefined;
    return Response.json(body, { status: error.status, headers });
  }

  console.error(error);
  const body: ApiErrorBody = {
    error: { code: "server_error", message: "Something went wrong on our side. Please try again." },
  };
  return Response.json(body, { status: 500 });
}

/** Wraps a route handler so every failure leaves as the same JSON error shape. */
export function route<P = Record<string, never>>(
  handler: (request: Request, params: P) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    try {
      return await handler(request, await context.params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "That request could not be read.");
  }

  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".");
    fields[path] ??= issue.message;
  }
  throw new ApiError(422, "invalid_input", parsed.error.issues[0]?.message ?? "Check your entries.", fields);
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function clientIp(request: Request) {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; cause?: unknown } | null;
  if (!candidate) return false;
  return candidate.code === "23505" || (candidate.cause ? isUniqueViolation(candidate.cause) : false);
}

import { isIP } from "node:net";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function localRequestError(request: Request): Response | null {
  const host = request.headers.get("host")?.trim().toLowerCase();
  if (!host)
    return Response.json(
      { error: "A local Host header is required." },
      { status: 403 },
    );
  let hostname = "";
  try {
    hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return Response.json({ error: "Invalid Host header." }, { status: 403 });
  }
  const isLoopback =
    hostname === "localhost" ||
    hostname === "::1" ||
    (isIP(hostname) === 4 && hostname.startsWith("127."));
  if (!isLoopback)
    return Response.json(
      { error: "ApplyLedger only accepts requests addressed to localhost." },
      { status: 403 },
    );
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json(
      { error: "Cross-site requests are blocked." },
      { status: 403 },
    );
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (
        parsed.host.toLowerCase() !== host ||
        !["http:", "https:"].includes(parsed.protocol)
      )
        return Response.json(
          { error: "Cross-origin requests are blocked." },
          { status: 403 },
        );
    } catch {
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    }
  }
  return null;
}

export async function readJson(
  request: Request,
  limitBytes = 1_000_000,
): Promise<unknown> {
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new HttpError(415, "Use application/json.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limitBytes) {
          await reader.cancel();
          throw new HttpError(
            413,
            "The request is larger than the allowed limit.",
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new HttpError(400, "Use valid UTF-8 JSON.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "issues" in error)
    return Response.json(
      { error: "Some fields are invalid.", details: error.issues },
      { status: 400 },
    );
  const message =
    error instanceof Error
      ? error.message
      : "The request could not be completed.";
  const status = /unique constraint|already exists/i.test(message)
    ? 409
    : /foreign key|choose an existing status/i.test(message)
      ? 400
      : 500;
  return Response.json(
    { error: status === 500 ? "The request could not be completed." : message },
    { status },
  );
}

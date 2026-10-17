/** Request parsing and HTTP errors, free of Next.js imports so they can be unit-tested. */
import { z } from "zod"

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`)

/** Default request size cap; routes that accept larger bodies pass their own. */
const DEFAULT_MAX_BYTES = 1_000_000

export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<z.infer<T>> {
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > maxBytes) throw new HttpError(413, "Request is too large")
  let text: string
  try {
    text = await request.text()
  } catch {
    throw new HttpError(400, "Request body could not be read")
  }
  if (text.length > maxBytes) throw new HttpError(413, "Request is too large")
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new HttpError(400, "Request body must be valid JSON")
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw new HttpError(422, "Validation failed", z.flattenError(result.error).fieldErrors)
  return result.data
}

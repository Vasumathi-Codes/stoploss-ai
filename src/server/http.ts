import { unstable_rethrow } from "next/navigation"
import { z } from "zod"

import { Prisma } from "@/generated/prisma/client"

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

export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new HttpError(400, "Request body must be valid JSON")
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw new HttpError(422, "Validation failed", z.flattenError(result.error).fieldErrors)
  return result.data
}

/** Wraps a route handler so thrown errors become consistent JSON responses. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args)
    } catch (error) {
      // Let Next.js handle its own control-flow errors (e.g. `connection()` during prerendering).
      unstable_rethrow(error)
      if (error instanceof HttpError) {
        return Response.json({ error: error.message, details: error.details }, { status: error.status })
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return Response.json({ error: "Record not found" }, { status: 404 })
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return Response.json({ error: "That value is already in use" }, { status: 409 })
      }
      console.error("[api]", error)
      return Response.json({ error: "Something went wrong on the server" }, { status: 500 })
    }
  }
}

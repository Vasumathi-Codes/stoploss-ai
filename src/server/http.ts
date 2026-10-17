import { unstable_rethrow } from "next/navigation"
import { Prisma } from "@/generated/prisma/client"
import { HttpError } from "@/server/errors"

export { HttpError, notFound, parseBody } from "@/server/errors"

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

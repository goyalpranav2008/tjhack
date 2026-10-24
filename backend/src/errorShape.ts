/**
 * Consistent error response shape: { error, details }
 */

import { Response } from "express";
import { ZodError } from "zod";

export function sendError(
  res: Response,
  status: number,
  error: string,
  details?: unknown
) {
  res.status(status).json({ error, details: details ?? null });
}

export function sendZodError(res: Response, err: ZodError) {
  res.status(422).json({
    error: "Validation failed",
    details: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
  });
}

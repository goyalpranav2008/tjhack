/**
 * Studio API key authentication.
 *
 * Set STUDIO_API_KEY in .env.  Any request that is missing or has a wrong
 * key is rejected with 401.  When the key is not configured in the environment
 * (local dev with no .env), the middleware is bypassed so the dev experience
 * is frictionless.
 */

import { Request, Response, NextFunction } from "express";

export function requireStudioKey(req: Request, res: Response, next: NextFunction) {
  const envKey = process.env.STUDIO_API_KEY;

  // No key configured — bypass (useful for local dev)
  if (!envKey) return next();

  const header = req.headers["x-studio-key"];
  if (!header || header !== envKey) {
    return res.status(401).json({
      error: "Unauthorized",
      details: "Missing or invalid X-Studio-Key header.",
    });
  }

  next();
}

import rateLimit from "express-rate-limit";

/**
 * Fan-facing write routes (consent + pledge).
 * 30 requests per 15 minutes per IP — generous for real fans, blocks automated
 * abuse without library dependencies on Redis (window store is in-process).
 */
export const fanWriteLimit = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              30,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: "Too many requests. Please wait and try again." },
  // Skip rate limiting in test environments
  skip: () => process.env.NODE_ENV === "test",
});

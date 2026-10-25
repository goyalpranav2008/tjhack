import rateLimit from "express-rate-limit";

/**
 * Fan-facing write routes (consent + pledge).
 * Default: 300 requests per 15 minutes per IP (generous for shared event Wi-Fi).
 * Override with FAN_RATE_MAX env var.
 * Skip in test environments.
 */
export const fanWriteLimit = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              parseInt(process.env.FAN_RATE_MAX ?? "300", 10),
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: "Too many requests. Please wait and try again." },
  // Skip rate limiting in test environments
  skip: () => process.env.NODE_ENV === "test",
});

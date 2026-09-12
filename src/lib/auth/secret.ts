import { createHash } from "node:crypto";

/**
 * Server-side signing key for participant grants.
 *
 * In production `AUTH_SECRET` is required: without it a signed cookie is only
 * as good as a public constant, so we refuse to start rather than pretend.
 * Locally we fall back to a fixed development key so `pnpm dev` works out of
 * the box and grants survive a hot reload.
 */
const DEV_FALLBACK = "verbatim-development-only-secret-do-not-use-in-production";

let warned = false;

export function authSecret(): Buffer {
  const raw = process.env.AUTH_SECRET?.trim();
  if (raw && raw.length >= 16) return createHash("sha256").update(raw).digest();
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production (at least 16 characters). Generate one with: openssl rand -base64 32");
  }
  if (raw && !warned) {
    warned = true;
    console.warn("[auth] AUTH_SECRET is shorter than 16 characters — using the development fallback key.");
  }
  return createHash("sha256").update(DEV_FALLBACK).digest();
}

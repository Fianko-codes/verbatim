import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "file:./local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

/**
 * A local `file:` database has no auth token, and drizzle-kit's turso dialect
 * insists on one — so pick the plain sqlite dialect for local development and
 * turso for a remote libsql URL.
 */
export default defineConfig(
  url.startsWith("file:")
    ? { schema: "./src/db/schema.ts", out: "./drizzle", dialect: "sqlite", dbCredentials: { url } }
    : { schema: "./src/db/schema.ts", out: "./drizzle", dialect: "turso", dbCredentials: { url, authToken } },
);

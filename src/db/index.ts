import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

const globalForDb = globalThis as unknown as { __verbatimDb?: ReturnType<typeof drizzle<typeof schema>> };

export const db =
  globalForDb.__verbatimDb ??
  drizzle(createClient(authToken ? { url, authToken } : { url }), { schema });

if (process.env.NODE_ENV !== "production") globalForDb.__verbatimDb = db;

export { schema };

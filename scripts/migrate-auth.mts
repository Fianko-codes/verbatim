/**
 * Add the authentication tables and columns to an existing database, without
 * touching a single existing row.
 *
 * Use this instead of `drizzle-kit push` on any database that already holds
 * studies. To add `is_public` — a NOT NULL column — SQLite makes drizzle-kit
 * rebuild the `studies` table, and `push --force` does that by dropping what is
 * there: on a database with real interviews it empties `studies` and cascades
 * into `interviews`, then reports an error. Every statement below is additive
 * and idempotent, so it is safe to run twice.
 *
 *   pnpm db:migrate-auth           # show what is missing
 *   pnpm db:migrate-auth --apply   # apply it
 */
import "dotenv/config";
import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL ?? "file:./local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;
const apply = process.argv.includes("--apply");

const db = createClient(authToken ? { url, authToken } : { url });

const tableExists = async (name: string) =>
  (await db.execute({ sql: "select 1 from sqlite_master where type='table' and name=?", args: [name] })).rows.length > 0;

const columnExists = async (table: string, column: string) =>
  (await db.execute(`pragma table_info(${table})`)).rows.some((r) => r.name === column);

type Step = { label: string; needed: () => Promise<boolean>; sql: string[] };

const steps: Step[] = [
  {
    label: "create table researchers",
    needed: async () => !(await tableExists("researchers")),
    sql: [
      `create table researchers (
         id text primary key not null,
         username text not null,
         name text default '' not null,
         password_hash text not null,
         created_at integer not null
       )`,
      `create unique index if not exists researchers_username_idx on researchers (username)`,
    ],
  },
  {
    label: "create table sessions",
    needed: async () => !(await tableExists("sessions")),
    sql: [
      `create table sessions (
         id text primary key not null,
         researcher_id text not null references researchers(id) on delete cascade,
         created_at integer not null,
         expires_at integer not null,
         last_seen_at integer not null,
         user_agent text
       )`,
      `create index if not exists sessions_researcher_idx on sessions (researcher_id)`,
      `create index if not exists sessions_expiry_idx on sessions (expires_at)`,
    ],
  },
  {
    label: "create table login_attempts",
    needed: async () => !(await tableExists("login_attempts")),
    sql: [
      `create table login_attempts (
         key text primary key not null,
         count integer default 0 not null,
         window_started_at integer not null
       )`,
    ],
  },
  {
    label: "add studies.researcher_id",
    needed: async () => !(await columnExists("studies", "researcher_id")),
    // Nullable on purpose: existing studies come out ownerless, which is
    // fail-closed (no account matches NULL) rather than public. `pnpm db:adopt`
    // hands them to an account.
    sql: [
      `alter table studies add column researcher_id text references researchers(id) on delete cascade`,
      `create index if not exists studies_researcher_idx on studies (researcher_id)`,
    ],
  },
  {
    label: "add studies.is_public",
    needed: async () => !(await columnExists("studies", "is_public")),
    // NOT NULL is fine here because the literal default fills every existing
    // row: they all become private, which is the safe direction.
    sql: [`alter table studies add column is_public integer default 0 not null`],
  },
];

if (!(await tableExists("studies"))) {
  console.error("No `studies` table — this looks like an empty database. Run `pnpm db:push` instead.");
  process.exit(1);
}

const pending: Step[] = [];
for (const step of steps) if (await step.needed()) pending.push(step);

const counts = await db.execute("select (select count(*) from studies) s, (select count(*) from interviews) i");
console.log(`Database: ${url.startsWith("file:") ? url : "remote libsql"}`);
console.log(`Holds ${counts.rows[0].s} studies and ${counts.rows[0].i} interviews — none of them will be modified.\n`);

if (pending.length === 0) {
  console.log("Already migrated. Nothing to do.");
  process.exit(0);
}

console.log(`${pending.length} change${pending.length === 1 ? "" : "s"} to apply:`);
for (const p of pending) console.log(`  - ${p.label}`);

if (!apply) {
  console.log("\nNothing applied — re-run with --apply.");
  process.exit(0);
}

for (const step of pending) {
  for (const sql of step.sql) await db.execute(sql);
  console.log(`  applied: ${step.label}`);
}

const after = await db.execute("select (select count(*) from studies) s, (select count(*) from interviews) i");
console.log(`\nDone. ${after.rows[0].s} studies and ${after.rows[0].i} interviews still present.`);
console.log("Next: create an account at /signup, then `pnpm db:adopt <username>` to claim the existing studies.");
process.exit(0);

/**
 * Delete studies and everything attached to them.
 *
 * This is destructive and irreversible: interviews, transcripts, live notes and
 * syntheses go with the study. Session recordings live at AssemblyAI and are
 * not touched, but nothing here will point at them any more.
 *
 *   pnpm db:reset-studies                      # show what would be deleted
 *   pnpm db:reset-studies --orphans --yes      # only studies with no owner
 *   pnpm db:reset-studies --all --yes          # every study
 *   pnpm db:reset-studies --id abc --id def --yes
 *
 * Nothing is deleted without --yes. Re-run `pnpm db:seed` afterwards to
 * recreate the public demo study.
 */
import "dotenv/config";
import { inArray, isNull } from "drizzle-orm";
import { db, schema } from "../src/db/index";

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const ids = argv.flatMap((a, i) => (a === "--id" && argv[i + 1] ? [argv[i + 1]] : []));

const all = has("--all");
const orphans = has("--orphans");
const confirmed = has("--yes");

if (!all && !orphans && ids.length === 0) {
  const rows = await db.select().from(schema.studies);
  console.log(`${rows.length} ${rows.length === 1 ? "study" : "studies"} in the database:\n`);
  for (const s of rows) {
    console.log(`  ${s.id}\t${s.researcherId ? `owner ${s.researcherId}` : "NO OWNER"}\t${s.isPublic ? "public" : "private"}\t${s.title}`);
  }
  console.log("\nNothing deleted. Pass --all, --orphans or --id <studyId>, plus --yes.");
  process.exit(0);
}

const targets = all
  ? await db.select().from(schema.studies)
  : orphans
    ? await db.select().from(schema.studies).where(isNull(schema.studies.researcherId))
    : await db.select().from(schema.studies).where(inArray(schema.studies.id, ids));

if (targets.length === 0) {
  console.log("No studies matched — nothing to delete.");
  process.exit(0);
}

const targetIds = targets.map((s) => s.id);
const interviews = await db.select().from(schema.interviews).where(inArray(schema.interviews.studyId, targetIds));

console.log(`About to delete ${targets.length} ${targets.length === 1 ? "study" : "studies"} and ${interviews.length} interviews:\n`);
for (const s of targets) console.log(`  ${s.id}\t${s.title}`);

if (!confirmed) {
  console.log("\nNothing deleted — add --yes to go ahead.");
  process.exit(0);
}

/*
 * Delete children first, explicitly. The schema declares ON DELETE CASCADE, but
 * SQLite only honours foreign keys when the connection has PRAGMA foreign_keys
 * ON, which is not guaranteed here — relying on it could leave orphaned turns
 * and notes behind.
 */
const interviewIds = interviews.map((i) => i.id);
if (interviewIds.length > 0) {
  await db.delete(schema.turns).where(inArray(schema.turns.interviewId, interviewIds));
  await db.delete(schema.insights).where(inArray(schema.insights.interviewId, interviewIds));
}
await db.delete(schema.insights).where(inArray(schema.insights.studyId, targetIds));
await db.delete(schema.syntheses).where(inArray(schema.syntheses.studyId, targetIds));
await db.delete(schema.interviews).where(inArray(schema.interviews.studyId, targetIds));
await db.delete(schema.studies).where(inArray(schema.studies.id, targetIds));

const left = await db.select({ id: schema.studies.id }).from(schema.studies);
console.log(`\nDeleted. ${left.length} ${left.length === 1 ? "study" : "studies"} remain.`);
console.log("Run `pnpm db:seed` to recreate the public demo study.");

process.exit(0);

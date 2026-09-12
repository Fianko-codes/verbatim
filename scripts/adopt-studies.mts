/**
 * Assign ownerless studies to a researcher account.
 *
 * Studies created before authentication existed have no `researcher_id`. The
 * app fails closed on those — every read requires the owner to match the signed
 * in researcher, and NULL matches nobody — so they are invisible rather than
 * public. This hands them to a real account.
 *
 *   pnpm db:adopt                 # list ownerless studies
 *   pnpm db:adopt <username>      # give them all to that account
 *   pnpm db:adopt <username> <studyId> [studyId...]
 */
import "dotenv/config";
import { eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../src/db/index";

const [username, ...studyIds] = process.argv.slice(2);

const orphans = await db.select().from(schema.studies).where(isNull(schema.studies.researcherId));

if (orphans.length === 0) {
  console.log("No ownerless studies — nothing to adopt.");
  process.exit(0);
}

if (!username) {
  console.log(`${orphans.length} ownerless ${orphans.length === 1 ? "study" : "studies"}:`);
  for (const s of orphans) console.log(`  ${s.id}\t${s.title}`);
  console.log("\nRun: pnpm db:adopt <username> [studyId...]");
  process.exit(0);
}

const rows = await db
  .select()
  .from(schema.researchers)
  .where(eq(schema.researchers.username, username.toLowerCase()))
  .limit(1);
const researcher = rows[0];
if (!researcher) {
  console.error(`No researcher named "${username}". Create the account first at /signup.`);
  process.exit(1);
}

const targets = studyIds.length > 0 ? orphans.filter((s) => studyIds.includes(s.id)) : orphans;
if (targets.length === 0) {
  console.error("None of those study ids are ownerless.");
  process.exit(1);
}

await db
  .update(schema.studies)
  .set({ researcherId: researcher.id })
  .where(
    inArray(
      schema.studies.id,
      targets.map((s) => s.id),
    ),
  );

console.log(`Adopted ${targets.length} ${targets.length === 1 ? "study" : "studies"} into "${researcher.username}":`);
for (const s of targets) console.log(`  ${s.id}\t${s.title}`);
process.exit(0);

/**
 * Re-run the study synthesis from the command line (useful after seeding a
 * production database).   pnpm tsx scripts/synthesize.mts [studyId]
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../src/db";
import { synthesizeStudy } from "../src/lib/analyst";

const studyId = process.argv[2] ?? "demo";
const study = (await db.select().from(schema.studies).where(eq(schema.studies.id, studyId)))[0];
if (!study) throw new Error(`No study ${studyId}`);
const rows = await db.select().from(schema.interviews).where(eq(schema.interviews.studyId, studyId));
const ins = await db.select().from(schema.insights).where(eq(schema.insights.studyId, studyId));
const interviews = rows
  .filter((r) => r.status === "completed" && r.summary)
  .map((r) => ({ ...r, insights: ins.filter((i) => i.interviewId === r.id) }));
console.log(`Synthesising ${interviews.length} interviews for "${study.title}"…`);
const content = await synthesizeStudy({ study, interviews });
await db.insert(schema.syntheses).values({ id: nanoid(12), studyId, interviewCount: interviews.length, content, createdAt: new Date() });
console.log(JSON.stringify(content, null, 1));
process.exit(0);

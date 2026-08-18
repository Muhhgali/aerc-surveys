import postgres from "postgres";
import { assertPreviewSeedMutation } from "./database-safety";
import { seedDevelopmentData } from "../src/infrastructure/database/seed-data";

async function main() {
  const target = assertPreviewSeedMutation();
  console.info(JSON.stringify({ action: "preview-seed", environment: target.environment, host: target.host, database: target.database }));
  const sql = postgres(target.url, { max: 1, prepare: false, connect_timeout: 15 });
  try {
    await seedDevelopmentData(sql);
    console.info("Preview demo fixtures applied");
  } finally {
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Preview seed failed");
  process.exit(1);
});

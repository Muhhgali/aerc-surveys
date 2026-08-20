import postgres from "postgres";
import { assertPreviewSeedMutation } from "./database-safety";
import { seedDevelopmentData } from "../src/infrastructure/database/seed-data";
import { postgresClientOptions } from "../src/infrastructure/database/database-url";

async function main() {
  const target = assertPreviewSeedMutation();
  console.info(JSON.stringify({ action: "preview-seed", environment: target.environment, host: target.host, database: target.database }));
  const sql = postgres(target.url, postgresClientOptions(target, { connect_timeout: 20 }));
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

import "dotenv/config";

import postgres from "postgres";
import { seedDevelopmentData } from "../src/infrastructure/database/seed-data";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for db:seed");

const sql = postgres(url, { max: 1, prepare: false });
try {
  await seedDevelopmentData(sql);
  console.info("Development seed applied");
} finally {
  await sql.end();
}

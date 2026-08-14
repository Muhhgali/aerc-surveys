import postgres from "postgres";
import { assertDevelopmentDatabaseMutation } from "./database-safety";
import { seedDevelopmentData } from "../src/infrastructure/database/seed-data";

async function main() {
  const sql = postgres(assertDevelopmentDatabaseMutation("seed"), { max: 1, prepare: false });
  try {
    await seedDevelopmentData(sql);
    console.info("Development seed applied");
  } finally {
    await sql.end();
  }
}

void main();

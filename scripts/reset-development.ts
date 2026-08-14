import postgres from "postgres";
import { assertDevelopmentDatabaseMutation } from "./database-safety";
import { seedIds } from "../src/infrastructure/database/seed-data";

async function main() {
  const sql = postgres(assertDevelopmentDatabaseMutation("reset"), { max: 1, prepare: false });
  try {
    await sql.begin(async (transaction) => {
      await transaction`delete from audit_logs where actor_user_id = ${seedIds.voterUser}`;
      await transaction`delete from documents where vote_id in (select id from votes where user_id = ${seedIds.voterUser})`;
      await transaction`delete from signature_requests where vote_session_id in (select id from vote_sessions where participant_id = ${seedIds.participant})`;
      await transaction`delete from votes where user_id = ${seedIds.voterUser}`;
      await transaction`delete from vote_sessions where participant_id = ${seedIds.participant}`;
      await transaction`delete from auth_sessions where user_id = ${seedIds.voterUser}`;
    });
    console.info("Development sessions and voting workflow data reset");
  } finally {
    await sql.end();
  }
}

void main();

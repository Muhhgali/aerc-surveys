import { config } from "dotenv";
import { hashPassword } from "../src/infrastructure/auth/password-hasher";
import { getDatabaseClient } from "../src/infrastructure/database/client";
import { parseLogin, assertPasswordPolicy } from "../src/domain/user-credentials";
import { platformRoleKeys, type PlatformRoleKey } from "../src/domain/admin-rbac";

config({ path: [process.env.DOTENV_CONFIG_PATH ?? ".env.local", ".env"] });

/**
 * Bootstraps or updates a console account with a login and password.
 * Credentials are read from the environment so nothing sensitive lands in the shell history:
 *
 *   CONSOLE_USER_LOGIN, CONSOLE_USER_PASSWORD, CONSOLE_USER_NAME,
 *   CONSOLE_USER_ROLE (platform role, default super_admin), CONSOLE_USER_EMAIL (optional)
 */
async function main() {
  const login = parseLogin(required("CONSOLE_USER_LOGIN"));
  const password = required("CONSOLE_USER_PASSWORD");
  assertPasswordPolicy(password);
  const displayName = process.env.CONSOLE_USER_NAME?.trim() || login;
  const email = process.env.CONSOLE_USER_EMAIL?.trim() || null;
  const role = (process.env.CONSOLE_USER_ROLE?.trim() || "super_admin") as PlatformRoleKey;
  if (!platformRoleKeys.includes(role)) throw new Error(`CONSOLE_USER_ROLE must be one of: ${platformRoleKeys.join(", ")}`);

  const sql = getDatabaseClient();
  const passwordHash = await hashPassword(password);
  try {
    const userId = await sql.begin(async (tx) => {
      const existing = await tx<{ userId: string }[]>`select user_id as "userId" from user_credentials where login=${login}`;
      const id = existing[0]?.userId
        ?? (await tx<{ id: string }[]>`insert into users (display_name, email, type, status) values (${displayName}, ${email}, 'organization_representative', 'active') returning id`)[0].id;
      await tx`
        insert into user_credentials (user_id, login, password_hash, must_change_password)
        values (${id}, ${login}, ${passwordHash}, false)
        on conflict (user_id) do update set login=excluded.login, password_hash=excluded.password_hash,
          must_change_password=false, failed_attempts=0, locked_until=null, updated_at=now()
      `;
      await tx`insert into platform_access_controls (user_id) values (${id}) on conflict (user_id) do update set disabled_at=null, disabled_by_user_id=null, updated_at=now()`;
      await tx`insert into user_platform_roles (user_id, role_id) select ${id}, pr.id from platform_roles pr where pr.role_key=${role} on conflict do nothing`;
      return id;
    });
    console.log(`Console account ready: login=${login} role=${role} userId=${userId}`);
  } finally {
    await sql.end();
  }
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Failed to create console user");
  process.exit(1);
});

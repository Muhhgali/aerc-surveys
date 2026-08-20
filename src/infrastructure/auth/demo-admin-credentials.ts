import { createHash, timingSafeEqual } from "node:crypto";
import { DEMO_ADMIN_LOGIN, DEMO_ADMIN_PASSWORD } from "@/src/domain/demo-fixtures";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isDemoAdminPassword(login: string, password: string): boolean {
  const loginOk = timingSafeEqual(digest(login.trim().toLowerCase()), digest(DEMO_ADMIN_LOGIN));
  const passwordOk = timingSafeEqual(digest(password), digest(DEMO_ADMIN_PASSWORD));
  return loginOk && passwordOk;
}

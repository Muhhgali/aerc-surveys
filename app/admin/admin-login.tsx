"use client";

import { ArrowRight, Building2, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogin({ unauthorized = false }: { unauthorized?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false); const [error, setError] = useState(unauthorized ? "Для этого раздела нужна административная роль." : "");
  async function login() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/dev/admin-session", { method: "POST" });
      if (!response.ok) throw new Error(); router.push("/admin"); router.refresh();
    } catch { setError("Development-вход недоступен. Проверьте mock provider и environment."); setPending(false); }
  }
  return <main className="admin-login-shell">
    <section className="admin-login-brand"><div className="admin-login-logo"><Building2 size={30}/></div><span>АСТАНА-ЕРЦ</span><h1>Управление электронными опросами</h1><p>Защищённая рабочая среда для публикации, контроля участия и проверки документов.</p><div><ShieldCheck size={18}/> Server-side RBAC</div><div><LockKeyhole size={18}/> Trusted PostgreSQL session</div></section>
    <section className="admin-login-card"><span className="admin-kicker">ADMIN CONSOLE</span><h2>Вход для сотрудников</h2><p>На этом этапе доступна только development identity. В production mock-вход автоматически не включается.</p>{error?<div className="admin-alert danger">{error}</div>:null}<button className="admin-button primary wide" disabled={pending} onClick={login}>{pending?"Проверяем доступ…":"Войти как development admin"}<ArrowRight size={18}/></button><Link href="/login">Вернуться в приложение собственника</Link></section>
  </main>;
}

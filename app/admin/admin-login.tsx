"use client";

import { ArrowRight, Building2, Fingerprint, Landmark, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminAccessError({ message }: { message: string }) {
  return <main className="admin-auth">
    <section className="admin-auth-card">
      <div className="admin-auth-mark"><Building2 size={26} /></div>
      <span className="admin-kicker">БИЗНЕС-АККАУНТ</span>
      <h1>Не удалось проверить доступ</h1>
      <div className="admin-alert danger">{message}</div>
      <Link href="/admin/login">Перейти ко входу</Link>
    </section>
  </main>;
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return body?.error?.message || fallback;
}

export function AdminLogin({ unauthorized = false, mockAuthEnabled = false }: { unauthorized?: boolean; mockAuthEnabled?: boolean }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"password" | "egov" | "digital_id" | "change" | "">("");
  const [error, setError] = useState(unauthorized ? "Для этого раздела нужна административная роль." : "");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  // refresh() after push(): the console is force-dynamic, but the router cache can still hold the tree
  // rendered for the previously signed-in account when accounts are switched in one browser session.
  function enterConsole() {
    router.push("/admin");
    router.refresh();
  }

  async function authenticateWithPassword(event: FormEvent) {
    event.preventDefault();
    setPending("password"); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login, password }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(await readError(response, "Не удалось войти в консоль"));
      const body = await response.json() as { mustChangePassword?: boolean };
      setPending("");
      if (body.mustChangePassword) { setMustChange(true); return; }
      enterConsole();
    } catch (cause) {
      setError(describe(cause));
      setPending("");
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== repeatPassword) { setError("Пароли не совпадают"); return; }
    setPending("change"); setError("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(await readError(response, "Не удалось изменить пароль"));
      setPending("");
      enterConsole();
    } catch (cause) {
      setError(describe(cause));
      setPending("");
    }
  }

  async function authenticateWithProvider(method: "egov" | "digital_id") {
    setPending(method); setError("");
    try {
      const response = await fetch("/api/dev/admin-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(await readError(response, response.status === 404 ? "Вход через госсервисы недоступен в этой среде" : "Не удалось войти в консоль"));
      setPending("");
      enterConsole();
    } catch (cause) {
      setError(describe(cause));
      setPending("");
    }
  }

  if (mustChange) {
    return <main className="admin-auth">
      <section className="admin-auth-card">
        <div className="admin-auth-mark"><LockKeyhole size={26} /></div>
        <span className="admin-kicker">ПЕРВЫЙ ВХОД</span>
        <h1>Задайте постоянный пароль</h1>
        <p>Временный пароль нужно заменить перед началом работы. Минимум 10 символов, буквы и цифры.</p>
        {error ? <div className="admin-alert danger">{error}</div> : null}
        <form className="admin-auth-form" onSubmit={changePassword}>
          <label className="admin-field"><span>Новый пароль</span><input type="password" autoComplete="new-password" minLength={10} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label className="admin-field"><span>Повторите пароль</span><input type="password" autoComplete="new-password" minLength={10} required value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} /></label>
          <button className="admin-button primary wide" disabled={Boolean(pending)} type="submit">{pending === "change" ? "Сохраняем…" : "Сохранить и войти"}<ArrowRight size={18} /></button>
        </form>
      </section>
    </main>;
  }

  return <main className="admin-auth">
    <section className="admin-auth-card">
      <div className="admin-auth-mark"><Building2 size={26} /></div>
      <span className="admin-kicker">БИЗНЕС-АККАУНТ</span>
      <h1>Вход в консоль опросов</h1>
      <p>Для сотрудников Астана-ЕРЦ, ОСИ, КСК и управляющих организаций. Логин и пароль выдаёт администратор платформы.</p>
      {error ? <div className="admin-alert danger">{error}</div> : null}
      <form className="admin-auth-form" onSubmit={authenticateWithPassword}>
        <label className="admin-field"><span>Логин</span><input autoComplete="username" required value={login} onChange={(event) => setLogin(event.target.value)} placeholder="user@org.kz" /></label>
        <label className="admin-field"><span>Пароль</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="admin-button primary wide" disabled={Boolean(pending)} type="submit">{pending === "password" ? "Проверяем доступ…" : "Войти в консоль"}<ArrowRight size={18} /></button>
      </form>
      {mockAuthEnabled ? <>
        <div className="admin-auth-split"><span>или через ЭЦП / госсервисы (демонстрация)</span></div>
        <div className="admin-auth-methods">
          <button className="admin-auth-method" disabled={Boolean(pending)} type="button" onClick={() => void authenticateWithProvider("egov")}><span className="auth-icon egov-icon"><Landmark size={18} /></span><span><strong>Войти через eGov</strong><small>Электронная цифровая подпись</small></span></button>
          <button className="admin-auth-method" disabled={Boolean(pending)} type="button" onClick={() => void authenticateWithProvider("digital_id")}><span className="auth-icon digital-icon"><Fingerprint size={18} /></span><span><strong>Войти через Digital ID</strong><small>Быстрая проверка личности</small></span></button>
        </div>
      </> : null}
      <div className="admin-auth-notes">
        <span><ShieldCheck size={15} /> Server-side RBAC</span>
        <span><LockKeyhole size={15} /> Сессия только в PostgreSQL</span>
      </div>
      <Link href="/login">Вернуться во вход собственника</Link>
    </section>
  </main>;
}

function describe(cause: unknown): string {
  const aborted = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
  if (aborted) return "Проверка доступа не завершилась. PostgreSQL не ответил вовремя.";
  return cause instanceof Error ? cause.message : "Не удалось войти в консоль";
}

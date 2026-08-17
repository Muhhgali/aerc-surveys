"use client";

/* eslint-disable @next/next/no-img-element -- Signature images are runtime canvas data URLs. */

import {
  Archive, ArrowLeft, ArrowRight, Building2, CalendarDays, Check,
  CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, Clock3, FileText,
  Fingerprint, Hash, Home, Landmark, LockKeyhole, Mail, MapPin, PenLine,
  RotateCcw, Search, Send, ShieldCheck, UserRoundCheck, Vote, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppHeader, Brand, StepDots } from "./app-chrome";
import { SignaturePad } from "./signature-pad";
import { archivedSheets, defaultAnswers, surveys, type Answer } from "./survey-data";
import { VotingSheet } from "./voting-sheet";

type Screen = "login" | "verify" | "dashboard" | "archive" | "archiveDocument" | "intro" | "preview" | "account" | "vote" | "review" | "sign" | "success" | "document";
type AuthMethod = "Digital ID" | "eGov";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type VoteApiDto = {
  id: string;
  surveyId: string;
  status: "draft" | "ready_to_sign" | "signing" | "signed" | "submitted" | "voided";
  stateVersion: number;
  submittedAt: string | null;
  answers: { questionId: string; choice: "for" | "against" | "abstain" }[];
  account: { accountNumber: string; address: string; unit: string };
};

// Browser storage is intentionally limited to harmless UI navigation preferences.
// Identity, eligibility, answers, signatures, and submissions must be server-owned.
const STORAGE_KEY = "aerc-surveys-ui-preferences-v1";

const surveySegments: Partial<Record<Screen, string>> = { preview: "preview", account: "account", vote: "vote", review: "review", sign: "sign", success: "success", document: "document" };

function pathFor(screen: Screen, surveyId: string, archiveId: string) {
  if (screen === "login") return "/login";
  if (screen === "verify") return "/auth/verify";
  if (screen === "dashboard") return "/dashboard";
  if (screen === "archive") return "/archive";
  if (screen === "archiveDocument") return `/archive/${archiveId}`;
  if (screen === "intro") return `/surveys/${surveyId}`;
  return `/surveys/${surveyId}/${surveySegments[screen]}`;
}

function routeFromPath(pathname: string): { screen: Screen; surveyId?: string; archiveId?: string } | null {
  if (pathname === "/login") return { screen: "login" };
  if (pathname === "/auth/verify") return { screen: "verify" };
  if (pathname === "/dashboard") return { screen: "dashboard" };
  if (pathname === "/archive") return { screen: "archive" };
  const archiveMatch = pathname.match(/^\/archive\/([^/]+)$/);
  if (archiveMatch) return { screen: "archiveDocument", archiveId: archiveMatch[1] };
  const surveyMatch = pathname.match(/^\/surveys\/([^/]+)(?:\/(preview|account|vote|review|sign|success|document))?$/);
  if (!surveyMatch) return null;
  return { screen: (surveyMatch[2] || "intro") as Screen, surveyId: surveyMatch[1] };
}

export default function SurveyApp() {
  const [screen, setScreen] = useState<Screen>("login");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("Digital ID");
  const [verifyStep, setVerifyStep] = useState(0);
  const [emailMode, setEmailMode] = useState(false);
  const [account, setAccount] = useState("");
  const [accountStatus, setAccountStatus] = useState<"idle" | "loading" | "found" | "error">("idle");
  const [accountDetails, setAccountDetails] = useState<{ address: string; unit: string } | null>(null);
  const [selectedSurveyId, setSelectedSurveyId] = useState(surveys[0].id);
  const [selectedArchiveId, setSelectedArchiveId] = useState(archivedSheets[0].id);
  const [answers, setAnswers] = useState<(Answer | null)[]>(defaultAnswers(surveys[0]));
  const [questionIndex, setQuestionIndex] = useState(0);
  const [signature, setSignature] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [submittedAt, setSubmittedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authStatus, setAuthStatus] = useState<"checking" | "authenticated" | "anonymous">("checking");
  const [activeVoteId, setActiveVoteId] = useState("");
  const [finalizedDocumentId, setFinalizedDocumentId] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const idempotencyKey = useRef("");
  const [hydrated, setHydrated] = useState(false);
  const selectedSurvey = surveys.find((survey) => survey.id === selectedSurveyId) || surveys[0];
  const selectedArchive = archivedSheets.find((sheet) => sheet.id === selectedArchiveId) || archivedSheets[0];
  const questions = selectedSurvey.questions;
  const documentId = finalizedDocumentId || activeVoteId || `AERC-VOTE-2026-${selectedSurvey.protocol.padStart(6, "0")}52`;

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const state = JSON.parse(saved) as { screen?: Screen; selectedSurveyId?: string; selectedArchiveId?: string };
          const route = routeFromPath(window.location.pathname);
          const surveyId = route?.surveyId || state.selectedSurveyId || surveys[0].id;
          const survey = surveys.find((item) => item.id === surveyId) || surveys[0];
          setSelectedSurveyId(survey.id);
          setSelectedArchiveId(route?.archiveId || state.selectedArchiveId || archivedSheets[0].id);
          setAnswers(defaultAnswers(survey));
          const initial = route?.screen || state.screen;
          if (initial) setScreen(initial);
        } else {
          const route = routeFromPath(window.location.pathname);
          if (route) {
            setScreen(route.screen);
            if (route.surveyId) {
              const survey = surveys.find((item) => item.id === route.surveyId) || surveys[0];
              setSelectedSurveyId(survey.id); setAnswers(defaultAnswers(survey));
            }
            if (route.archiveId) setSelectedArchiveId(route.archiveId);
          }
        }
      } catch { localStorage.removeItem(STORAGE_KEY); }
      setHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ screen, selectedSurveyId, selectedArchiveId }));
  }, [screen, selectedSurveyId, selectedArchiveId, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    void fetch("/api/session", { cache: "no-store" }).then((response) => {
      if (response.ok) { setAuthStatus("authenticated"); return; }
      setAuthStatus("anonymous");
      if (!(["login", "verify"] as Screen[]).includes(screen)) {
        setScreen("login"); window.history.replaceState({}, "", "/login");
      }
    }).catch(() => {
      setAuthStatus("anonymous"); setScreen("login"); window.history.replaceState({}, "", "/login");
    });
  }, [hydrated, screen]);
  useEffect(() => {
    if (authStatus !== "authenticated" || activeVoteId || !selectedSurvey.backendId || !(["vote", "review", "sign"] as Screen[]).includes(screen)) return;
    void fetch(`/api/surveys/${selectedSurvey.backendId}/votes`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) {
        if (response.status === 404) { setScreen("account"); window.history.replaceState({}, "", pathFor("account", selectedSurveyId, selectedArchiveId)); }
        return;
      }
      const { vote } = await response.json() as { vote: VoteApiDto };
      const restored = questions.map((question) => {
        const choice = vote.answers.find((answer) => answer.questionId === question.id)?.choice;
        return choice === "for" ? "За" : choice === "against" ? "Против" : choice === "abstain" ? "Воздержусь" : null;
      }) satisfies (Answer | null)[];
      setActiveVoteId(vote.id); setAnswers(restored); setAccount(vote.account.accountNumber);
      setAccountDetails({ address: vote.account.address, unit: vote.account.unit }); setAccountStatus("found"); setSaveStatus("saved");
      if (vote.status === "submitted") {
        setSubmittedAt(vote.submittedAt ? new Date(vote.submittedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "");
        setScreen("success"); window.history.replaceState({}, "", pathFor("success", selectedSurveyId, selectedArchiveId));
      }
    }).catch(() => setToast("Не удалось восстановить черновик"));
  }, [authStatus, activeVoteId, questions, screen, selectedArchiveId, selectedSurvey.backendId, selectedSurveyId]);
  useEffect(() => {
    const pop = () => { const route = routeFromPath(window.location.pathname); if (route) { setScreen(route.screen); if (route.surveyId) setSelectedSurveyId(route.surveyId); if (route.archiveId) setSelectedArchiveId(route.archiveId); } };
    window.addEventListener("popstate", pop); return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (screen !== "verify") return;
    const timers = [setTimeout(() => setVerifyStep(1), 450), setTimeout(() => setVerifyStep(2), 1000), setTimeout(() => setVerifyStep(3), 1600)];
    return () => timers.forEach(clearTimeout);
  }, [screen, authMethod]);

  const go = (next: Screen, replace = false) => {
    setScreen(next); window.scrollTo({ top: 0, behavior: "smooth" });
    window.history[replace ? "replaceState" : "pushState"]({}, "", pathFor(next, selectedSurveyId, selectedArchiveId));
  };
  const openSurvey = (surveyId: string, next: "intro" | "preview") => {
    const survey = surveys.find((item) => item.id === surveyId) || surveys[0];
    idempotencyKey.current = "";
    setActiveVoteId(""); setFinalizedDocumentId(""); setSaveStatus("idle"); setAccountDetails(null); setSelectedSurveyId(survey.id); setAnswers(defaultAnswers(survey)); setSignature(""); setSubmittedAt(""); setQuestionIndex(0); setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" }); window.history.pushState({}, "", pathFor(next, survey.id, selectedArchiveId));
  };
  const openArchive = (archiveId: string) => {
    setSelectedArchiveId(archiveId); setScreen("archiveDocument"); window.scrollTo({ top: 0, behavior: "smooth" });
    window.history.pushState({}, "", pathFor("archiveDocument", selectedSurveyId, archiveId));
  };
  const findAccount = async () => {
    setAccountStatus("loading");
    try {
      const response = await fetch("/api/personal-accounts/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountReference: account.trim() }),
      });
      if (!response.ok) throw new Error("Account resolution failed");
      const data = await response.json() as { account: { accountNumber: string; address: string; unit: string } };
      setAccount(data.account.accountNumber); setAccountDetails({ address: data.account.address, unit: data.account.unit });
      setAccountStatus("found");
      setToast("Объект успешно подтверждён");
    } catch {
      setAccountStatus("error");
    }
  };
  const logout = async () => {
    await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
    localStorage.removeItem(STORAGE_KEY); setAuthStatus("anonymous"); setActiveVoteId(""); setFinalizedDocumentId(""); setSelectedSurveyId(surveys[0].id); setAnswers(defaultAnswers(surveys[0])); setAccount(""); setAccountDetails(null); setSignature(""); setSubmittedAt(""); setAccountStatus("idle"); go("login", true);
  };
  const completeAuthentication = async () => {
    const response = await fetch("/api/dev/session", { method: "POST" });
    if (!response.ok) {
      setToast("Mock-вход недоступен: проверьте environment и development seed");
      return;
    }
    setAuthStatus("authenticated");
    setToast("Добро пожаловать!");
    go("dashboard");
  };
  const completed = answers.filter(Boolean).length;
  const startVoting = async () => {
    if (!selectedSurvey.backendId) { setToast("Опрос ещё не опубликован в backend"); return; }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/surveys/${selectedSurvey.backendId}/votes`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountReference: account, idempotencyKey: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error("Vote start failed");
      const { vote } = await response.json() as { vote: VoteApiDto };
      setActiveVoteId(vote.id); setAccount(vote.account.accountNumber); setAccountDetails({ address: vote.account.address, unit: vote.account.unit });
      setAnswers(questions.map((question) => {
        const choice = vote.answers.find((answer) => answer.questionId === question.id)?.choice;
        return choice === "for" ? "За" : choice === "against" ? "Против" : choice === "abstain" ? "Воздержусь" : null;
      }));
      setSaveStatus(vote.answers.length ? "saved" : "idle");
      if (vote.status === "submitted") { setSubmittedAt(vote.submittedAt ? new Date(vote.submittedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""); go("success"); }
      else { setQuestionIndex(0); go("vote"); }
    } catch { setToast("Не удалось создать или восстановить голосование"); }
    finally { setSubmitting(false); }
  };
  const saveAnswer = async (index: number, answer: Answer) => {
    if (!activeVoteId || !questions[index].id || saveStatus === "saving") return;
    const previous = answers[index];
    const next = [...answers]; next[index] = answer; setAnswers(next); setSaveStatus("saving");
    const choices = { "За": "for", "Против": "against", "Воздержусь": "abstain" } as const;
    try {
      const response = await fetch(`/api/votes/${activeVoteId}/answers`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), questionId: questions[index].id, choice: choices[answer] }),
      });
      if (!response.ok) throw new Error("Autosave failed");
      setSaveStatus("saved");
    } catch {
      const rollback = [...next]; rollback[index] = previous; setAnswers(rollback); setSaveStatus("error");
      setToast("Ответ не сохранён. Повторите выбор");
    }
  };
  const submitVote = async () => {
    if (!activeVoteId) {
      setToast("Черновик голосования не найден");
      return;
    }
    setSubmitting(true);
    idempotencyKey.current ||= crypto.randomUUID();
    try {
      if (signature) {
        const signatureResponse = await fetch(`/api/votes/${activeVoteId}/visual-signature`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataUrl: signature }),
        });
        if (!signatureResponse.ok) throw new Error("Visual signature upload failed");
      }
      const response = await fetch(`/api/votes/${activeVoteId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: idempotencyKey.current }),
      });
      if (!response.ok) throw new Error("Vote submission failed");
      const result = await response.json() as { document: { id: string } };
      setFinalizedDocumentId(result.document.id);
      setConfirmOpen(false);
      setSubmittedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
      setToast("Голосование отправлено");
      setTimeout(() => go("success"), 300);
    } catch {
      setToast("Не удалось отправить голосование");
    } finally {
      setSubmitting(false);
    }
  };

  const Login = () => <><div className="login-hero"><Brand /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-building"><Building2 size={72} /></div></div>
    <main className="screen-content login-content"><span className="eyebrow">ЭЛЕКТРОННОЕ ГОЛОСОВАНИЕ</span><h1>Опросы собственников</h1><p className="lead">Авторизуйтесь для участия в голосовании</p>
      <div className="auth-list">
        <button className="auth-button" onClick={() => { setVerifyStep(0); setAuthMethod("eGov"); go("verify"); }}><span className="auth-icon egov-icon"><Landmark size={21} /></span><span><strong>Войти через eGov</strong><small>Государственные сервисы</small></span><ChevronRight size={20} /></button>
        <button className="auth-button" onClick={() => { setVerifyStep(0); setAuthMethod("Digital ID"); go("verify"); }}><span className="auth-icon digital-icon"><Fingerprint size={23} /></span><span><strong>Войти через Digital ID</strong><small>Быстрая проверка личности</small></span><ChevronRight size={20} /></button>
        <button className="auth-button" onClick={() => setEmailMode(!emailMode)}><span className="auth-icon mail-icon"><Mail size={20} /></span><span><strong>Войти по электронной почте</strong><small>Для зарегистрированных пользователей</small></span><ChevronRight size={20} className={emailMode ? "rotate" : ""} /></button>
        {emailMode && <div className="email-panel"><label htmlFor="email">Электронная почта</label><div className="input-shell"><Mail size={18} /><input id="email" defaultValue="demo@aerc.kz" type="email" /></div><button className="button button-primary button-full" onClick={() => { setVerifyStep(0); setAuthMethod("Digital ID"); go("verify"); }}>Продолжить <ArrowRight size={18} /></button></div>}
      </div><div className="security-note"><LockKeyhole size={15} /><span>Ваши данные защищены и используются только для подтверждения права голоса</span></div>
    </main><footer className="app-footer">Демонстрационная версия · 2026</footer></>;

  const Verify = () => <><AppHeader title={authMethod} onBack={() => go("login")} /><main className="screen-content verify-content">
    <div className={`verify-visual ${verifyStep === 3 ? "is-success" : ""}`}><div className="verify-rings"><span /><span /><span /></div><div className="verify-icon">{verifyStep === 3 ? <Check size={42} /> : <UserRoundCheck size={42} />}</div></div>
    <span className="eyebrow">БЕЗОПАСНАЯ АВТОРИЗАЦИЯ</span><h1>{verifyStep === 3 ? "Личность подтверждена" : "Проверяем ваши данные"}</h1><p className="lead">{verifyStep === 3 ? "Данные успешно получены. Можно продолжить." : "Это займёт всего несколько секунд"}</p>
    <div className="verify-steps">{["Проверка личности", "Получение данных", "Подтверждение"].map((label, index) => <div className={`verify-row ${verifyStep > index ? "done" : verifyStep === index ? "current" : ""}`} key={label}><span className="verify-step-icon">{verifyStep > index ? <Check size={15} /> : index + 1}</span><span>{label}</span>{verifyStep === index && verifyStep < 3 && <span className="mini-loader" />}</div>)}</div>
    <button className="button button-primary button-full bottom-cta" disabled={verifyStep < 3} onClick={completeAuthentication}>Продолжить <ArrowRight size={18} /></button>
  </main></>;

  const Dashboard = () => <><AppHeader action={<button className="text-action" onClick={logout}>Выйти</button>} /><main className="screen-content dashboard-content">
    <div className="welcome-row"><div><span className="muted">Добрый день!</span><h1>Мои опросы</h1></div><div className="avatar">ОК</div></div>
    <section className="profile-card"><div className="profile-icon"><Building2 size={24} /></div><div className="profile-main"><small>Профиль участника</small><strong>ТОО «ОСИ-КСК»</strong><span>БИН 220740012345</span></div><div className="verified-badge"><ShieldCheck size={14} /> Организация подтверждена</div></section>
    <div className="section-heading"><h2>Доступные опросы</h2><span>2 активных</span></div>
    <div className="survey-stack">{surveys.map((survey) => <section className={`survey-card ${survey.status === "active" ? "survey-active" : "survey-soon"}`} key={survey.id}><div className="survey-top"><span className={`status-badge ${survey.status === "active" ? "new" : "scheduled"}`}>{survey.status === "active" ? "Открыт" : "Скоро"}</span><div className="survey-symbol"><Vote size={24} /></div></div><small className="protocol">ПРОТОКОЛ №{survey.protocol}</small><h3>{survey.title}</h3><p className="survey-description">{survey.subtitle}</p><div className="survey-meta"><span><CalendarDays size={16} /> {survey.deadline}</span><span><ClipboardCheck size={16} /> {survey.questions.length} вопросов</span></div><div className="survey-actions"><button className="button button-secondary" onClick={() => openSurvey(survey.id, "preview")}><FileText size={17} /> Посмотреть</button>{survey.status === "active" ? <button className="button button-primary" onClick={() => openSurvey(survey.id, "intro")}>Пройти <ArrowRight size={18} /></button> : <button className="button button-muted" disabled>С 1 сентября</button>}</div></section>)}</div>
    <div className="section-heading archive-heading"><h2>Мои опросные листы</h2><button className="text-action" onClick={() => go("archive")}>Все листы <ChevronRight size={15} /></button></div>
    <section className="survey-card survey-complete"><div><span className="status-badge complete"><CheckCircle2 size={13} /> Завершён</span><small>ПРОТОКОЛ №8</small></div><h3>Выбор сервисной компании</h3><p>Голосование завершено 12.06.2026</p><button className="archive-open" onClick={() => openArchive("8")}><FileText size={16} /> Открыть опросный лист <ChevronRight size={16} /></button></section>
  </main></>;

  const ArchiveView = () => <><AppHeader title="Мои опросные листы" onBack={() => go("dashboard")} /><main className="screen-content archive-content">
    <div className="archive-hero"><div className="page-icon"><Archive size={27} /></div><div><span className="eyebrow">АРХИВ ДОКУМЕНТОВ</span><h1>История голосований</h1></div></div>
    <p className="lead">Все подписанные вами листы хранятся в профиле и доступны для просмотра или печати.</p>
    <div className="archive-summary"><div><strong>{archivedSheets.length}</strong><span>документа</span></div><div><strong>2026</strong><span>текущий год</span></div><ShieldCheck size={24} /></div>
    <div className="archive-list">{archivedSheets.map((sheet) => <article className="archive-card" key={sheet.id}><div className="archive-card-icon"><FileText size={22} /></div><div className="archive-card-copy"><div><span className="status-badge complete"><CheckCircle2 size={12} /> Подписан</span><small>ПРОТОКОЛ №{sheet.protocol}</small></div><h2>{sheet.title}</h2><p><CalendarDays size={14} /> {sheet.date} · {sheet.questions.length} вопроса</p><strong className="archive-document-id">{sheet.documentId}</strong></div><button className="archive-card-button" onClick={() => openArchive(sheet.id)} aria-label={`Открыть лист к протоколу №${sheet.protocol}`}><ChevronRight size={19} /></button></article>)}</div>
    <div className="notice"><ShieldCheck size={19} /><span>Архивные документы защищены и содержат отметку электронной подписи.</span></div>
  </main></>;

  const Intro = () => <><AppHeader onBack={() => go("dashboard")} /><main className="screen-content intro-content"><StepDots step={1} /><div className="document-illustration"><FileText size={48} /><span><Check size={16} /></span></div><span className="eyebrow">ПРОТОКОЛ №{selectedSurvey.protocol}</span><h1>{selectedSurvey.title}</h1><p className="lead">{selectedSurvey.subtitle}</p>
    <section className="info-card"><div><ClipboardCheck size={19} /><span><small>Количество</small><strong>{questions.length} вопросов</strong></span></div><div><Clock3 size={19} /><span><small>Время</small><strong>{selectedSurvey.duration}</strong></span></div><div><CalendarDays size={19} /><span><small>Срок голосования</small><strong>{selectedSurvey.deadlineShort}</strong></span></div></section>
    <div className="notice"><ShieldCheck size={19} /><span>Ваш голос будет зафиксирован сервером после финального подтверждения. Визуальная подпись пока не является ЭЦП.</span></div><button className="button button-secondary button-full preview-link" onClick={() => go("preview")}><FileText size={18} /> Посмотреть все вопросы</button><button className="button button-primary button-full" onClick={() => go("account")}>Начать <ArrowRight size={18} /></button>
  </main></>;

  const Preview = () => <><AppHeader title="Просмотр опроса" onBack={() => go("dashboard")} /><main className="screen-content preview-content">
    <div className="preview-hero"><div className="page-icon"><FileText size={27} /></div><div><span className="eyebrow">ПРОТОКОЛ №{selectedSurvey.protocol}</span><h1>{selectedSurvey.title}</h1></div></div>
    <p className="lead">Ознакомьтесь с повесткой до начала голосования. Ответы на этом экране не сохраняются.</p>
    <div className="preview-meta"><span><ClipboardCheck size={16} /> {questions.length} вопросов</span><span><CalendarDays size={16} /> {selectedSurvey.deadlineShort}</span><span><Clock3 size={16} /> {selectedSurvey.duration}</span></div>
    <div className="preview-list">{questions.map((question, index) => <article key={question.short}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{question.short}</small><p>{question.text}</p></div></article>)}</div>
    <div className="notice"><ShieldCheck size={19} /><span>Для участия потребуется подтвердить объект лицевым счётом Астана-ЕРЦ.</span></div>
    {selectedSurvey.status === "active" ? <button className="button button-primary button-full" onClick={() => go("intro")}>Перейти к опросу <ArrowRight size={18} /></button> : <button className="button button-muted button-full" disabled>Голосование откроется 1 сентября</button>}
  </main></>;

  const Account = () => <><AppHeader title="Подтверждение объекта" onBack={() => go("intro")} /><main className="screen-content account-content"><StepDots step={2} /><div className="page-icon"><Home size={27} /></div><h1>Найдём ваш объект</h1><p className="lead">Введите лицевой счёт Астана-ЕРЦ, чтобы подтвердить право голоса</p>
    <label className="field-label" htmlFor="account">Лицевой счёт</label><div className={`account-input ${accountStatus === "error" ? "has-error" : ""}`}><Hash size={20} /><input id="account" inputMode="numeric" placeholder="Например, 1911" value={account} onChange={(event) => { setAccount(event.target.value.replace(/\D/g, "")); setAccountStatus("idle"); }} />{account && <button onClick={() => { setAccount(""); setAccountStatus("idle"); }} aria-label="Очистить"><X size={17} /></button>}</div>
    <span className="field-help">Для демонстрации используйте счёт <button onClick={() => setAccount("1911")}>1911</button></span><button className="button button-primary button-full" disabled={!account || accountStatus === "loading" || accountStatus === "found"} onClick={findAccount}>{accountStatus === "loading" ? <><span className="button-loader" /> Ищем объект...</> : <><Search size={18} /> Найти объект</>}</button>
    {accountStatus === "loading" && <div className="object-skeleton" aria-label="Загрузка данных объекта"><span /><span /><span /><span /></div>}
    {accountStatus === "error" && <div className="error-card"><CircleAlert size={20} /><div><strong>Лицевой счёт не найден</strong><p>Для демонстрации используйте 1911.</p></div></div>}
    {accountStatus === "found" && <section className="object-card"><div className="object-head"><span><Check size={20} /></span><div><small>ЛИЦЕВОЙ СЧЁТ НАЙДЕН</small><strong>Данные подтверждены</strong></div></div><div className="object-address"><MapPin size={19} /><div><small>Адрес объекта</small><strong>{accountDetails?.address || "г. Астана, ул. Геодезическая, д. 12"}</strong></div></div><div className="object-grid"><div><small>Квартира</small><strong>{accountDetails?.unit || "52"}</strong></div><div><small>Тип помещения</small><strong>Квартира</strong></div></div><button className="button button-primary button-full" disabled={submitting} onClick={startVoting}>{submitting ? "Открываем голосование..." : "Перейти к голосованию"} <ArrowRight size={18} /></button></section>}
  </main></>;

  const VoteScreen = () => { const current = questions[questionIndex]; return <><AppHeader title="Голосование" onBack={() => questionIndex > 0 ? setQuestionIndex(questionIndex - 1) : go("account")} action={<span className="nav-counter">{questionIndex + 1}/{questions.length}</span>} /><main className="screen-content vote-content">
    <div className="progress-label"><span>Вопрос {questionIndex + 1} из {questions.length}</span><strong>{Math.round(((questionIndex + 1) / questions.length) * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div><div className="question-number">{String(questionIndex + 1).padStart(2, "0")}</div><span className="eyebrow">{current.short.toUpperCase()}</span><h1>{current.text}</h1><p className="choice-label">Выберите один вариант ответа <span aria-live="polite" data-testid="save-status">{saveStatus === "saving" ? "· Сохранение..." : saveStatus === "saved" ? "· Сохранено" : saveStatus === "error" ? "· Ошибка сохранения" : ""}</span></p>
    <div className="answer-list">{(["За", "Против", "Воздержусь"] as Answer[]).map((answer) => <button className={`answer-card ${answers[questionIndex] === answer ? "selected" : ""}`} disabled={saveStatus === "saving"} key={answer} onClick={() => void saveAnswer(questionIndex, answer)}><span className="radio-mark">{answers[questionIndex] === answer && <Check size={15} />}</span><span><strong>{answer}</strong><small>{answer === "За" ? "Поддерживаю предложение" : answer === "Против" ? "Не поддерживаю предложение" : "Не принимаю сторону"}</small></span></button>)}</div>
    <div className="vote-navigation"><button className="button button-secondary" disabled={saveStatus === "saving"} onClick={() => questionIndex > 0 ? setQuestionIndex(questionIndex - 1) : go("account")}><ArrowLeft size={18} /> Назад</button><button className="button button-primary" disabled={!answers[questionIndex] || saveStatus === "saving"} onClick={() => questionIndex === questions.length - 1 ? go("review") : setQuestionIndex(questionIndex + 1)}>{questionIndex === questions.length - 1 ? "Проверить" : "Далее"} <ArrowRight size={18} /></button></div>
  </main></>; };

  const Review = () => <><AppHeader title="Проверка" onBack={() => { setQuestionIndex(questions.length - 1); go("vote"); }} /><main className="screen-content review-content"><StepDots step={3} /><div className="page-icon success-soft"><ClipboardCheck size={27} /></div><h1>Проверьте ответы</h1><p className="lead">При необходимости вернитесь к вопросу и измените выбор</p>
    <div className="review-list">{questions.map((question, index) => <button key={question.short} onClick={() => { setQuestionIndex(index); go("vote"); }}><span className="review-number">{index + 1}</span><span className="review-copy"><strong>{question.short}</strong><small>{question.text}</small></span><span className={`answer-pill ${answers[index] === "За" ? "yes" : answers[index] === "Против" ? "no" : "neutral"}`}>{answers[index] || "Не выбран"}</span><ChevronRight size={17} /></button>)}</div>
    <div className="completion-note"><CheckCircle2 size={18} /><strong>{completed} из {questions.length} вопросов заполнено</strong></div><button className="button button-primary button-full" disabled={completed !== questions.length || saveStatus === "saving"} onClick={() => go("sign")}><PenLine size={18} /> Перейти к подтверждению</button>
  </main></>;

  const Sign = () => <><AppHeader title="Подтверждение" onBack={() => go("review")} /><main className="screen-content sign-content"><StepDots step={4} /><div className="page-icon"><PenLine size={27} /></div><h1>Подтвердите голосование</h1><p className="lead">Рукописная подпись пока является только визуальным UX-элементом и не является ЭЦП</p>
    <section className="sign-summary"><div><FileText size={20} /><span><small>Документ</small><strong>Протокол №{selectedSurvey.protocol} · {questions.length} ответов</strong></span></div><div><MapPin size={20} /><span><small>Объект</small><strong>ул. Геодезическая, 12, кв. 52</strong></span></div></section>
    <section className={`signature-preview ${signature ? "has-signature" : ""}`}>{signature ? <img src={signature} alt="Ваша подпись" /> : <><div className="dashed-pen"><PenLine size={29} /></div><strong>Подпись ещё не добавлена</strong><small>Нажмите кнопку ниже и распишитесь пальцем</small></>}</section>
    <button className={`button button-full ${signature ? "button-secondary" : "button-primary"}`} onClick={() => setSignatureOpen(true)}>{signature ? <><RotateCcw size={18} /> Перерисовать подпись</> : <><PenLine size={18} /> Добавить визуальную подпись</>}</button><div className="legal-note"><LockKeyhole size={16} /><span>Юридический signing lifecycle будет подключён отдельным этапом. Сейчас сервер фиксирует только ответы.</span></div><button className="button button-primary button-full" disabled={!signature} onClick={() => setConfirmOpen(true)}><Send size={18} /> Подтвердить и отправить</button>
  </main>{signatureOpen && <SignaturePad onCancel={() => setSignatureOpen(false)} onSave={(value) => { setSignature(value); setSignatureOpen(false); setToast("Визуальная подпись добавлена"); }} />}{confirmOpen && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="confirm-modal"><div className="modal-icon"><ShieldCheck size={26} /></div><h2>Подтверждение</h2><p>Вы ответили на все вопросы. Сервер повторно проверит полноту и право голоса.</p><div className="modal-summary"><span>Протокол №{selectedSurvey.protocol}</span><strong>{questions.length} ответов</strong></div><button className="button button-primary button-full" disabled={submitting} onClick={submitVote}>{submitting ? "Отправляем..." : "Отправить голосование"} <Send size={18} /></button><button className="button button-ghost button-full" disabled={submitting} onClick={() => setConfirmOpen(false)}>Отмена</button></div></div>}</>;

  const Success = () => <><AppHeader /><main className="screen-content success-content"><div className="success-animation"><span /><div><Check size={45} /></div><i /><i /><i /><i /></div><span className="eyebrow success-eyebrow">ГОЛОСОВАНИЕ ЗАВЕРШЕНО</span><h1>Голос принят</h1><p className="lead">Ваше голосование успешно зарегистрировано.</p>
    <section className="receipt-card"><div className="receipt-row"><span><CalendarDays size={18} /> Дата и время</span><strong>20 августа 2026 · {submittedAt || "14:32"}</strong></div><div className="receipt-row"><span><Hash size={18} /> ID документа</span><strong className="document-id">{documentId}</strong></div><div className="receipt-row"><span><ShieldCheck size={18} /> Статус</span><strong className="green-text">Отправлено и принято</strong></div></section>
    <div className="success-actions"><button className="button button-primary button-full" onClick={() => go("document")}><FileText size={18} /> Открыть демонстрационный лист</button><button className="button button-secondary button-full" onClick={() => go("dashboard")}><Home size={18} /> На главную</button></div><p className="receipt-hint">Ответы и итоговый статус сохранены в PostgreSQL. PDF и ЭЦП относятся к следующему этапу.</p>
  </main></>;

  const Document = () => <VotingSheet onBack={() => go("success")} protocol={selectedSurvey.protocol} title={selectedSurvey.title} date="20.08.2026" time={submittedAt || "14:32"} documentId={documentId} address="г. Астана, ул. Геодезическая, д. 12" account="1911" apartment="52" questions={questions} answers={answers} signature={signature} />;
  const ArchiveDocument = () => <VotingSheet onBack={() => go("archive")} protocol={selectedArchive.protocol} title={selectedArchive.title} date={selectedArchive.date} time={selectedArchive.time} documentId={selectedArchive.documentId} address={selectedArchive.address} account={selectedArchive.account} apartment={selectedArchive.apartment} questions={selectedArchive.questions} answers={selectedArchive.answers} archived />;

  const content = () => {
    switch (screen) { case "login": return <Login />; case "verify": return <Verify />; case "dashboard": return <Dashboard />; case "archive": return <ArchiveView />; case "archiveDocument": return <ArchiveDocument />; case "intro": return <Intro />; case "preview": return <Preview />; case "account": return <Account />; case "vote": return <VoteScreen />; case "review": return <Review />; case "sign": return <Sign />; case "success": return <Success />; case "document": return <Document />; }
  };
  if (!hydrated || authStatus === "checking") return <div className="app-loading"><Brand /><span className="loader-ring" /></div>;
  if (screen === "document" || screen === "archiveDocument") return <div className="presentation document-presentation">{content()}{toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}</div>;
  return <div className="presentation"><aside className="presentation-copy"><Brand /><div className="presentation-main"><span className="presentation-tag"><ShieldCheck size={15} /> ЦИФРОВОЙ СЕРВИС</span><h2>Голосовать удобно.<br />Решать — вместе.</h2><p>Безопасный и прозрачный способ участия собственников в управлении своим домом.</p><div className="presentation-points"><span><Check size={15} /> Подтверждение личности</span><span><Check size={15} /> Электронный документ</span><span><Check size={15} /> Рукописная подпись</span></div></div><div className="presentation-footer">ТОО «Астана-ЕРЦ» · 2026</div></aside><div className="phone-stage"><div className={`phone-shell screen-${screen}`}>{content()}</div><p className="desktop-caption">Интерактивный демонстрационный прототип</p></div>{toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}</div>;
}

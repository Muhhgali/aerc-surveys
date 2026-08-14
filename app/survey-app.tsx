"use client";

/* eslint-disable @next/next/no-img-element -- Signature images are runtime canvas data URLs. */

import {
  ArrowLeft, ArrowRight, BatteryFull, Building2, CalendarDays, Check,
  CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, Clock3, FileText,
  Fingerprint, Hash, Home, Landmark, LockKeyhole, Mail, MapPin, PenLine,
  Printer, RotateCcw, Search, Send, ShieldCheck, Signal, UserRoundCheck,
  Vote, Wifi, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Screen = "login" | "verify" | "dashboard" | "intro" | "preview" | "account" | "vote" | "review" | "sign" | "success" | "document";
type Answer = "За" | "Против" | "Воздержусь";
type AuthMethod = "Digital ID" | "eGov";

const STORAGE_KEY = "aerc-surveys-demo-v1";
const DOCUMENT_ID = "AERC-VOTE-2026-00001911";
const questions = [
  { short: "Текущий ремонт", text: "Утвердить план текущего ремонта подъездов многоквартирного жилого дома на 2026 год." },
  { short: "Видеонаблюдение", text: "Утвердить установку дополнительных камер видеонаблюдения в подъездах и на придомовой территории." },
  { short: "LED-освещение", text: "Утвердить замену осветительных приборов в местах общего пользования на энергоэффективные LED-светильники." },
  { short: "Благоустройство", text: "Утвердить проведение работ по благоустройству придомовой территории." },
  { short: "Обслуживание сетей", text: "Утвердить проведение профилактического обслуживания инженерных сетей многоквартирного жилого дома." },
  { short: "Информирование", text: "Утвердить предложенный порядок информирования собственников о выполненных работах и расходовании средств." },
];
const defaults: Answer[] = ["За", "Против", "За", "За", "Воздержусь", "За"];
const pathByScreen: Record<Screen, string> = {
  login: "/login", verify: "/auth/verify", dashboard: "/dashboard", intro: "/surveys/12", preview: "/surveys/12/preview",
  account: "/surveys/12/account", vote: "/surveys/12/vote", review: "/surveys/12/review",
  sign: "/surveys/12/sign", success: "/surveys/12/success", document: "/surveys/12/document",
};
const screenByPath = Object.fromEntries(Object.entries(pathByScreen).map(([screen, path]) => [path, screen])) as Record<string, Screen>;

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}>
    <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
    <div className="brand-copy"><strong>АСТАНА-ЕРЦ</strong>{!compact && <small>Городской цифровой сервис</small>}</div>
  </div>;
}

function AppHeader({ title, onBack, action }: { title?: string; onBack?: () => void; action?: React.ReactNode }) {
  return <header className="app-header">
    <div className="status-bar" aria-hidden="true"><span>09:41</span><span className="status-icons"><Signal size={12} /><Wifi size={13} /><BatteryFull size={16} /></span></div>
    <div className="nav-bar">
      {onBack ? <button className="icon-button" onClick={onBack} aria-label="Назад"><ArrowLeft size={21} /></button> : <Brand compact />}
      {title && <strong className="nav-title">{title}</strong>}<div className="nav-action">{action}</div>
    </div>
  </header>;
}

function StepDots({ step }: { step: number }) {
  return <div className="step-dots" aria-label={`Этап ${step} из 4`}>{[1, 2, 3, 4].map((item) => <span key={item} className={item <= step ? "active" : ""} />)}</div>;
}

function SignaturePad({ onSave, onCancel }: { onSave: (value: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = rect.width * ratio; canvas.height = rect.height * ratio;
    const context = canvas.getContext("2d");
    context?.scale(ratio, ratio);
    if (context) { context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = 2.7; context.strokeStyle = "#172033"; }
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true;
    const { x, y } = point(event); const context = canvasRef.current?.getContext("2d");
    context?.beginPath(); context?.moveTo(x, y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const { x, y } = point(event); const context = canvasRef.current?.getContext("2d");
    context?.lineTo(x, y); context?.stroke(); setHasInk(true);
  };
  const clear = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); setHasInk(false);
  };
  return <div className="sheet-backdrop" role="dialog" aria-modal="true"><div className="signature-sheet">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onCancel} aria-label="Закрыть"><X size={20} /></button>
    <div className="sheet-icon"><PenLine size={24} /></div><h2>Поставьте подпись</h2><p>Распишитесь пальцем в области ниже</p>
    <div className="canvas-wrap"><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} aria-label="Поле для рукописной подписи" /><span /><small>Подпись собственника</small></div>
    <div className="sheet-actions"><button className="button button-secondary" onClick={clear}><RotateCcw size={18} /> Очистить</button><button className="button button-primary" disabled={!hasInk} onClick={() => canvasRef.current && onSave(canvasRef.current.toDataURL("image/png"))}>Готово <Check size={18} /></button></div>
    {!hasInk && <span className="sheet-hint">Сначала поставьте подпись</span>}
  </div></div>;
}

export default function SurveyApp() {
  const [screen, setScreen] = useState<Screen>("login");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("Digital ID");
  const [verifyStep, setVerifyStep] = useState(0);
  const [emailMode, setEmailMode] = useState(false);
  const [account, setAccount] = useState("");
  const [accountStatus, setAccountStatus] = useState<"idle" | "loading" | "found" | "error">("idle");
  const [answers, setAnswers] = useState<(Answer | null)[]>(defaults);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [signature, setSignature] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [submittedAt, setSubmittedAt] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const state = JSON.parse(saved) as { screen?: Screen; answers?: (Answer | null)[]; account?: string; signature?: string; submittedAt?: string };
          if (state.answers?.length === 6) setAnswers(state.answers);
          if (state.account) setAccount(state.account);
          if (state.signature) setSignature(state.signature);
          if (state.submittedAt) setSubmittedAt(state.submittedAt);
          const initial = screenByPath[window.location.pathname] || state.screen;
          if (initial) setScreen(initial);
        } else if (screenByPath[window.location.pathname]) setScreen(screenByPath[window.location.pathname]);
      } catch { localStorage.removeItem(STORAGE_KEY); }
      setHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ screen, answers, account, signature, submittedAt }));
  }, [screen, answers, account, signature, submittedAt, hydrated]);
  useEffect(() => {
    const pop = () => { const next = screenByPath[window.location.pathname]; if (next) setScreen(next); };
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
    window.history[replace ? "replaceState" : "pushState"]({}, "", pathByScreen[next]);
  };
  const findAccount = () => {
    setAccountStatus("loading");
    setTimeout(() => { if (account.trim() === "1911") { setAccountStatus("found"); setToast("Объект успешно подтверждён"); } else setAccountStatus("error"); }, 900);
  };
  const logout = () => {
    localStorage.removeItem(STORAGE_KEY); setAnswers(defaults); setAccount(""); setSignature(""); setSubmittedAt(""); setAccountStatus("idle"); go("login", true);
  };
  const completed = answers.filter(Boolean).length;

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
    <button className="button button-primary button-full bottom-cta" disabled={verifyStep < 3} onClick={() => { setToast("Добро пожаловать!"); go("dashboard"); }}>Продолжить <ArrowRight size={18} /></button>
  </main></>;

  const Dashboard = () => <><AppHeader action={<button className="text-action" onClick={logout}>Выйти</button>} /><main className="screen-content dashboard-content">
    <div className="welcome-row"><div><span className="muted">Добрый день!</span><h1>Мои опросы</h1></div><div className="avatar">ОК</div></div>
    <section className="profile-card"><div className="profile-icon"><Building2 size={24} /></div><div className="profile-main"><small>Профиль участника</small><strong>ТОО «ОСИ-КСК»</strong><span>БИН 220740012345</span></div><div className="verified-badge"><ShieldCheck size={14} /> Организация подтверждена</div></section>
    <div className="section-heading"><h2>Доступные опросы</h2><span>1 активный</span></div>
    <section className="survey-card survey-active"><div className="survey-top"><span className="status-badge new">Новый</span><div className="survey-symbol"><Vote size={24} /></div></div><small className="protocol">ПРОТОКОЛ №12</small><h3>Собрание собственников дома</h3><div className="survey-meta"><span><CalendarDays size={16} /> до 25 августа 2026</span><span><ClipboardCheck size={16} /> 6 вопросов</span></div><div className="survey-actions"><button className="button button-secondary" onClick={() => go("preview")}><FileText size={17} /> Посмотреть</button><button className="button button-primary" onClick={() => go("intro")}>Пройти опрос <ArrowRight size={18} /></button></div></section>
    <section className="survey-card survey-complete"><div><span className="status-badge complete"><CheckCircle2 size={13} /> Завершён</span><small>ПРОТОКОЛ №8</small></div><h3>Выбор сервисной компании</h3><p>Голосование завершено 12.06.2026</p></section>
    <div className="empty-state"><FileText size={19} /><span>Других активных опросов пока нет</span></div>
  </main></>;

  const Intro = () => <><AppHeader onBack={() => go("dashboard")} /><main className="screen-content intro-content"><StepDots step={1} /><div className="document-illustration"><FileText size={48} /><span><Check size={16} /></span></div><span className="eyebrow">ПРОТОКОЛ №12</span><h1>Собрание собственников квартир и помещений</h1><p className="lead">Голосование по вопросам управления многоквартирным жилым домом</p>
    <section className="info-card"><div><ClipboardCheck size={19} /><span><small>Количество</small><strong>6 вопросов</strong></span></div><div><Clock3 size={19} /><span><small>Время</small><strong>≈ 3 минуты</strong></span></div><div><CalendarDays size={19} /><span><small>Срок голосования</small><strong>до 25.08.2026</strong></span></div></section>
    <div className="notice"><ShieldCheck size={19} /><span>Ваш голос будет зафиксирован после подтверждения рукописной подписью.</span></div><button className="button button-secondary button-full preview-link" onClick={() => go("preview")}><FileText size={18} /> Посмотреть все вопросы</button><button className="button button-primary button-full" onClick={() => go("account")}>Начать <ArrowRight size={18} /></button>
  </main></>;

  const Preview = () => <><AppHeader title="Просмотр опроса" onBack={() => go("dashboard")} /><main className="screen-content preview-content">
    <div className="preview-hero"><div className="page-icon"><FileText size={27} /></div><div><span className="eyebrow">ПРОТОКОЛ №12</span><h1>Вопросы голосования</h1></div></div>
    <p className="lead">Ознакомьтесь с повесткой до начала голосования. Ответы на этом экране не сохраняются.</p>
    <div className="preview-meta"><span><ClipboardCheck size={16} /> 6 вопросов</span><span><CalendarDays size={16} /> до 25.08.2026</span><span><Clock3 size={16} /> ≈ 3 минуты</span></div>
    <div className="preview-list">{questions.map((question, index) => <article key={question.short}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{question.short}</small><p>{question.text}</p></div></article>)}</div>
    <div className="notice"><ShieldCheck size={19} /><span>Для участия потребуется подтвердить объект лицевым счётом Астана-ЕРЦ.</span></div>
    <button className="button button-primary button-full" onClick={() => go("intro")}>Перейти к опросу <ArrowRight size={18} /></button>
  </main></>;

  const Account = () => <><AppHeader title="Подтверждение объекта" onBack={() => go("intro")} /><main className="screen-content account-content"><StepDots step={2} /><div className="page-icon"><Home size={27} /></div><h1>Найдём ваш объект</h1><p className="lead">Введите лицевой счёт Астана-ЕРЦ, чтобы подтвердить право голоса</p>
    <label className="field-label" htmlFor="account">Лицевой счёт</label><div className={`account-input ${accountStatus === "error" ? "has-error" : ""}`}><Hash size={20} /><input id="account" inputMode="numeric" placeholder="Например, 1911" value={account} onChange={(event) => { setAccount(event.target.value.replace(/\D/g, "")); setAccountStatus("idle"); }} />{account && <button onClick={() => { setAccount(""); setAccountStatus("idle"); }} aria-label="Очистить"><X size={17} /></button>}</div>
    <span className="field-help">Для демонстрации используйте счёт <button onClick={() => setAccount("1911")}>1911</button></span><button className="button button-primary button-full" disabled={!account || accountStatus === "loading" || accountStatus === "found"} onClick={findAccount}>{accountStatus === "loading" ? <><span className="button-loader" /> Ищем объект...</> : <><Search size={18} /> Найти объект</>}</button>
    {accountStatus === "loading" && <div className="object-skeleton" aria-label="Загрузка данных объекта"><span /><span /><span /><span /></div>}
    {accountStatus === "error" && <div className="error-card"><CircleAlert size={20} /><div><strong>Лицевой счёт не найден</strong><p>Для демонстрации используйте 1911.</p></div></div>}
    {accountStatus === "found" && <section className="object-card"><div className="object-head"><span><Check size={20} /></span><div><small>ЛИЦЕВОЙ СЧЁТ НАЙДЕН</small><strong>Данные подтверждены</strong></div></div><div className="object-address"><MapPin size={19} /><div><small>Адрес объекта</small><strong>г. Астана, ул. Геодезическая, д. 12</strong></div></div><div className="object-grid"><div><small>Квартира</small><strong>52</strong></div><div><small>Тип помещения</small><strong>Квартира</strong></div></div><button className="button button-primary button-full" onClick={() => { setQuestionIndex(0); go("vote"); }}>Перейти к голосованию <ArrowRight size={18} /></button></section>}
  </main></>;

  const VoteScreen = () => { const current = questions[questionIndex]; return <><AppHeader title="Голосование" onBack={() => questionIndex > 0 ? setQuestionIndex(questionIndex - 1) : go("account")} action={<span className="nav-counter">{questionIndex + 1}/6</span>} /><main className="screen-content vote-content">
    <div className="progress-label"><span>Вопрос {questionIndex + 1} из 6</span><strong>{Math.round(((questionIndex + 1) / 6) * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${((questionIndex + 1) / 6) * 100}%` }} /></div><div className="question-number">{String(questionIndex + 1).padStart(2, "0")}</div><span className="eyebrow">{current.short.toUpperCase()}</span><h1>{current.text}</h1><p className="choice-label">Выберите один вариант ответа</p>
    <div className="answer-list">{(["За", "Против", "Воздержусь"] as Answer[]).map((answer) => <button className={`answer-card ${answers[questionIndex] === answer ? "selected" : ""}`} key={answer} onClick={() => { const next = [...answers]; next[questionIndex] = answer; setAnswers(next); }}><span className="radio-mark">{answers[questionIndex] === answer && <Check size={15} />}</span><span><strong>{answer}</strong><small>{answer === "За" ? "Поддерживаю предложение" : answer === "Против" ? "Не поддерживаю предложение" : "Не принимаю сторону"}</small></span></button>)}</div>
    <div className="vote-navigation"><button className="button button-secondary" onClick={() => questionIndex > 0 ? setQuestionIndex(questionIndex - 1) : go("account")}><ArrowLeft size={18} /> Назад</button><button className="button button-primary" disabled={!answers[questionIndex]} onClick={() => questionIndex === 5 ? go("review") : setQuestionIndex(questionIndex + 1)}>{questionIndex === 5 ? "Проверить" : "Далее"} <ArrowRight size={18} /></button></div>
  </main></>; };

  const Review = () => <><AppHeader title="Проверка" onBack={() => { setQuestionIndex(5); go("vote"); }} /><main className="screen-content review-content"><StepDots step={3} /><div className="page-icon success-soft"><ClipboardCheck size={27} /></div><h1>Проверьте ответы</h1><p className="lead">При необходимости вернитесь к вопросу и измените выбор</p>
    <div className="review-list">{questions.map((question, index) => <button key={question.short} onClick={() => { setQuestionIndex(index); go("vote"); }}><span className="review-number">{index + 1}</span><span className="review-copy"><strong>{question.short}</strong><small>{question.text}</small></span><span className={`answer-pill ${answers[index] === "За" ? "yes" : answers[index] === "Против" ? "no" : "neutral"}`}>{answers[index] || "Не выбран"}</span><ChevronRight size={17} /></button>)}</div>
    <div className="completion-note"><CheckCircle2 size={18} /><strong>{completed} из 6 вопросов заполнено</strong></div><button className="button button-primary button-full" disabled={completed !== 6} onClick={() => go("sign")}><PenLine size={18} /> Подписать голосование</button>
  </main></>;

  const Sign = () => <><AppHeader title="Подписание" onBack={() => go("review")} /><main className="screen-content sign-content"><StepDots step={4} /><div className="page-icon"><PenLine size={27} /></div><h1>Подпишите голосование</h1><p className="lead">Одна подпись будет добавлена к каждому выбранному вами ответу</p>
    <section className="sign-summary"><div><FileText size={20} /><span><small>Документ</small><strong>Протокол №12 · 6 ответов</strong></span></div><div><MapPin size={20} /><span><small>Объект</small><strong>ул. Геодезическая, 12, кв. 52</strong></span></div></section>
    <section className={`signature-preview ${signature ? "has-signature" : ""}`}>{signature ? <img src={signature} alt="Ваша подпись" /> : <><div className="dashed-pen"><PenLine size={29} /></div><strong>Подпись ещё не добавлена</strong><small>Нажмите кнопку ниже и распишитесь пальцем</small></>}</section>
    <button className={`button button-full ${signature ? "button-secondary" : "button-primary"}`} onClick={() => setSignatureOpen(true)}>{signature ? <><RotateCcw size={18} /> Перерисовать подпись</> : <><PenLine size={18} /> Поставить подпись</>}</button><div className="legal-note"><LockKeyhole size={16} /><span>Нажимая «Подписать и отправить», вы подтверждаете достоверность выбранных ответов.</span></div><button className="button button-primary button-full" disabled={!signature} onClick={() => setConfirmOpen(true)}><Send size={18} /> Подписать и отправить</button>
  </main>{signatureOpen && <SignaturePad onCancel={() => setSignatureOpen(false)} onSave={(value) => { setSignature(value); setSignatureOpen(false); setToast("Подпись сохранена"); }} />}{confirmOpen && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="confirm-modal"><div className="modal-icon"><ShieldCheck size={26} /></div><h2>Подтверждение</h2><p>Вы ответили на все 6 вопросов. После отправки ответы будут зафиксированы в листе голосования.</p><div className="modal-summary"><span>Протокол №12</span><strong>6 ответов · подпись добавлена</strong></div><button className="button button-primary button-full" onClick={() => { setConfirmOpen(false); setSubmittedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })); setToast("Голосование отправлено"); setTimeout(() => go("success"), 300); }}>Отправить голосование <Send size={18} /></button><button className="button button-ghost button-full" onClick={() => setConfirmOpen(false)}>Отмена</button></div></div>}</>;

  const Success = () => <><AppHeader /><main className="screen-content success-content"><div className="success-animation"><span /><div><Check size={45} /></div><i /><i /><i /><i /></div><span className="eyebrow success-eyebrow">ГОЛОСОВАНИЕ ЗАВЕРШЕНО</span><h1>Голос принят</h1><p className="lead">Ваше голосование успешно зарегистрировано.</p>
    <section className="receipt-card"><div className="receipt-row"><span><CalendarDays size={18} /> Дата и время</span><strong>20 августа 2026 · {submittedAt || "14:32"}</strong></div><div className="receipt-row"><span><Hash size={18} /> ID документа</span><strong className="document-id">{DOCUMENT_ID}</strong></div><div className="receipt-row"><span><ShieldCheck size={18} /> Статус</span><strong className="green-text">Подписано и принято</strong></div></section>
    <div className="success-actions"><button className="button button-primary button-full" onClick={() => go("document")}><FileText size={18} /> Открыть PDF</button><button className="button button-secondary button-full" onClick={() => go("dashboard")}><Home size={18} /> На главную</button></div><p className="receipt-hint">Электронный лист голосования сохранён в вашем профиле</p>
  </main></>;

  const Document = () => <div className="document-view"><div className="document-toolbar no-print"><button className="icon-button" onClick={() => go("success")} aria-label="Назад"><ArrowLeft size={20} /></button><div><strong>Лист голосования</strong><small>A4 · готов к печати</small></div><button className="button button-primary print-button" onClick={() => window.print()}><Printer size={17} /> Печать / PDF</button></div>
    <article className="a4-document"><header className="paper-header"><Brand compact /><div className="paper-stamp"><ShieldCheck size={14} /> ЭЛЕКТРОННЫЙ ДОКУМЕНТ</div></header><div className="paper-title"><span>ТОО «Астана-ЕРЦ»</span><h1>ЛИСТ ГОЛОСОВАНИЯ №1</h1><p>к Протоколу №12 собрания собственников квартир, нежилых помещений многоквартирного жилого дома</p></div>
      <section className="paper-details"><div><small>Дата проведения</small><strong>20.08.2026</strong></div><div className="wide"><small>Местонахождение многоквартирного жилого дома</small><strong>г. Астана, ул. Геодезическая, д. 12</strong></div><div><small>Лицевой счёт</small><strong>1911</strong></div><div><small>Квартира</small><strong>52</strong></div></section>
      <table className="vote-table"><thead><tr><th>№</th><th>Вопросы, внесённые для обсуждения</th><th>За</th><th>Против</th><th>Воздержусь</th></tr></thead><tbody>{questions.map((question, index) => <tr key={question.short}><td>{index + 1}</td><td>{question.text}</td>{(["За", "Против", "Воздержусь"] as Answer[]).map((answer) => <td key={answer} className="signature-cell">{answers[index] === answer && signature && <img src={signature} alt="Подпись" />}</td>)}</tr>)}</tbody></table>
      <section className="owner-info"><h2>Сведения о собственнике</h2><div className="owner-grid"><div><small>Адрес объекта</small><strong>г. Астана, ул. Геодезическая, д. 12, кв. 52</strong></div><div><small>Лицевой счёт</small><strong>1911</strong></div><div><small>Дата и время голосования</small><strong>20.08.2026 · {submittedAt || "14:32"}</strong></div><div><small>ID документа</small><strong>{DOCUMENT_ID}</strong></div></div></section>
      <section className="paper-signature"><div><small>Подпись собственника</small>{signature ? <img src={signature} alt="Подпись собственника" /> : <span className="signature-placeholder">Подпись сохранится здесь</span>}</div><div className="qr-block"><div className="fake-qr">{Array.from({ length: 9 }).map((_, index) => <span key={index} />)}</div><small>Проверка документа</small><strong>{DOCUMENT_ID}</strong></div></section><footer className="paper-footer"><span>Сформировано в системе «Астана-ЕРЦ — Опросы»</span><span>Страница 1 из 1</span></footer>
    </article><button className="button button-primary mobile-print no-print" onClick={() => window.print()}><Printer size={18} /> Печать / Сохранить как PDF</button>
  </div>;

  const content = () => {
    switch (screen) { case "login": return <Login />; case "verify": return <Verify />; case "dashboard": return <Dashboard />; case "intro": return <Intro />; case "preview": return <Preview />; case "account": return <Account />; case "vote": return <VoteScreen />; case "review": return <Review />; case "sign": return <Sign />; case "success": return <Success />; case "document": return <Document />; }
  };
  if (!hydrated) return <div className="app-loading"><Brand /><span className="loader-ring" /></div>;
  if (screen === "document") return <div className="presentation document-presentation">{content()}{toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}</div>;
  return <div className="presentation"><aside className="presentation-copy"><Brand /><div className="presentation-main"><span className="presentation-tag"><ShieldCheck size={15} /> ЦИФРОВОЙ СЕРВИС</span><h2>Голосовать удобно.<br />Решать — вместе.</h2><p>Безопасный и прозрачный способ участия собственников в управлении своим домом.</p><div className="presentation-points"><span><Check size={15} /> Подтверждение личности</span><span><Check size={15} /> Электронный документ</span><span><Check size={15} /> Рукописная подпись</span></div></div><div className="presentation-footer">ТОО «Астана-ЕРЦ» · 2026</div></aside><div className="phone-stage"><div className={`phone-shell screen-${screen}`}>{content()}</div><p className="desktop-caption">Интерактивный демонстрационный прототип</p></div>{toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}</div>;
}

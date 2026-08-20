"use client";

/* eslint-disable @next/next/no-img-element -- Signature images are runtime canvas data URLs. */

import {
  Archive, ArrowLeft, ArrowRight, Building2, CalendarDays, Check,
  CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, Clock3, FileText,
  Fingerprint, Hash, Home, Landmark, LockKeyhole, Mail, MapPin, PenLine, Phone,
  RotateCcw, Search, Send, ShieldCheck, UserRound, UserRoundCheck, Vote, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DEMO_OWNER_FULL_NAME, DEMO_OWNER_OTP, DEMO_OWNER_PHONE, displayNameInitials, formatKzNational, kzPhoneFromInput, kzPhoneDigits, toE164Kz } from "@/src/domain/demo-fixtures";
import { AppHeader, Brand, StepDots } from "./app-chrome";
import { SignaturePad } from "./signature-pad";
import { archivedSheets, defaultAnswers, type Answer, type ArchivedSheet, type Survey } from "./survey-data";
import { VotingSheet } from "./voting-sheet";

type Screen = "login" | "verify" | "property" | "dashboard" | "archive" | "archiveDocument" | "intro" | "preview" | "account" | "vote" | "review" | "sign" | "success" | "document";
type AuthMethod = "Digital ID" | "eGov" | "OTP";
type OtpChannel = "whatsapp" | "email";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type AccountStatus = "idle" | "loading" | "found" | "error";
type VoteApiDto = {
  id: string;
  surveyId: string;
  status: "draft" | "ready_to_sign" | "signing" | "signed" | "submitted" | "voided";
  stateVersion: number;
  submittedAt: string | null;
  answers: { questionId: string; choice: "for" | "against" | "abstain" }[];
  account: { accountNumber: string; address: string; unit: string };
};
type AvailableSurveyDto = { id: string; protocol: string; title: string; subtitle: string; startsAt: string; closesAt: string; status: "active" | "scheduled" | "closed"; submitted?: boolean; questions: { id: string; position: number; text: string }[] };
type OwnerDocumentDto = {
  id: string;
  documentId: string;
  protocol: string;
  title: string;
  submittedAt: string | Date | null;
  account: string;
  address: string;
  apartment: string;
  questions: { id: string; position: number; text: string }[] | string;
  answers: { questionId: string; choice: "for" | "against" | "abstain" }[] | string;
};

// Placeholder shown only while the catalogue is empty; it is never a votable survey.
const noSurvey: Survey = {
  id: "", protocol: "—", title: "Нет доступных опросов", subtitle: "Опросы появятся после публикации в административной консоли.",
  deadline: "", deadlineShort: "", duration: "", status: "soon", questions: [],
};

function fromAvailableSurvey(survey: AvailableSurveyDto): Survey {
  const closesAt = new Date(survey.closesAt);
  return {
    id: survey.id === "00000000-0000-4000-8000-000000000012" ? "12" : survey.id,
    backendId: survey.id,
    protocol: survey.protocol,
    title: survey.title,
    subtitle: survey.subtitle,
    deadline: `до ${closesAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`,
    deadlineShort: `до ${closesAt.toLocaleDateString("ru-RU")}`,
    duration: `≈ ${Math.max(1, Math.ceil(survey.questions.length / 2))} мин.`,
    status: survey.submitted ? "complete" : survey.status === "active" ? "active" : "soon",
    questions: survey.questions.map((question) => ({ id: question.id, short: `Вопрос ${question.position}`, text: question.text })),
  };
}

function asJsonArray<T>(value: T[] | string | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as T[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function choiceToAnswer(choice: string | undefined): Answer | null {
  if (choice === "for") return "За";
  if (choice === "against") return "Против";
  if (choice === "abstain") return "Воздержусь";
  return null;
}

function fromOwnerDocument(document: OwnerDocumentDto): ArchivedSheet {
  const submitted = document.submittedAt ? new Date(document.submittedAt) : new Date();
  const questions = asJsonArray<{ id: string; position: number; text: string }>(document.questions).map((question) => ({
    id: question.id,
    short: `Вопрос ${question.position}`,
    text: question.text,
  }));
  const saved = asJsonArray<{ questionId: string; choice: "for" | "against" | "abstain" }>(document.answers);
  return {
    id: String(document.id),
    protocol: document.protocol,
    title: document.title,
    date: submitted.toLocaleDateString("ru-RU"),
    time: submitted.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    documentId: String(document.documentId),
    address: document.address,
    account: document.account,
    apartment: document.apartment,
    questions,
    answers: questions.map((question) => choiceToAnswer(saved.find((answer) => answer.questionId === question.id)?.choice)),
  };
}

// Browser storage is intentionally limited to harmless UI navigation preferences.
// Identity, eligibility, answers, signatures, and submissions must be server-owned.
const STORAGE_KEY = "aerc-surveys-ui-preferences-v1";

const surveySegments: Partial<Record<Screen, string>> = { preview: "preview", account: "account", vote: "vote", review: "review", sign: "sign", success: "success", document: "document" };
const surveyScreens: Screen[] = ["intro", "preview", "account", "vote", "review", "sign", "success", "document"];
const questionScreens: Screen[] = ["vote", "review", "sign", "document"];

function pathFor(screen: Screen, surveyId: string, archiveId: string) {
  if (screen === "login") return "/login";
  if (screen === "verify") return "/auth/verify";
  if (screen === "property") return "/property";
  if (screen === "dashboard") return "/dashboard";
  if (screen === "archive") return "/archive";
  if (screen === "archiveDocument") return `/archive/${archiveId}`;
  if (screen === "intro") return `/surveys/${surveyId}`;
  return `/surveys/${surveyId}/${surveySegments[screen]}`;
}

function isDeclaredNameComplete(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).length >= 2;
}

async function apiErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: { message?: string; issues?: { message: string }[] } } | null;
  return body?.error?.message || body?.error?.issues?.[0]?.message || fallback;
}

function OwnerAccountScreen(props: {
  variant: "property" | "survey";
  account: string;
  accountStatus: AccountStatus;
  accountDetails: { address: string; unit: string } | null;
  fullName: string;
  submitting: boolean;
  onAccountChange: (value: string) => void;
  onClear: () => void;
  onFind: () => void;
  onFullNameChange: (value: string) => void;
  onLogout: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const canSearch = props.account.replace(/\D/g, "").length >= 4 && props.accountStatus !== "loading";
  const canContinue = props.accountStatus === "found" && props.accountDetails && (props.variant === "property" || isDeclaredNameComplete(props.fullName));
  const showLookup = props.variant === "property" || props.accountStatus !== "found";
  return <>
    {props.variant === "property"
      ? <AppHeader title="Лицевой счёт" action={<button className="text-action" onClick={props.onLogout}>Выйти</button>} />
      : <AppHeader title="Подтверждение объекта" onBack={props.onBack} />}
    <main className="screen-content account-content">
      {props.variant === "survey" ? <StepDots step={2} /> : null}
      <div className="page-icon"><Home size={27} /></div>
      <h1>{props.variant === "property" ? "Укажите лицевой счёт" : "Подтвердите объект"}</h1>
      <p className="lead">{props.variant === "property" ? "После проверки счёта появится адрес дома, затем список опросов" : "Проверьте адрес, квартиру и введите ФИО собственника"}</p>
      {showLookup && <form onSubmit={(event) => { event.preventDefault(); props.onFind(); }}>
        <label className="field-label" htmlFor="account">Лицевой счёт</label>
        <div className={`account-input ${props.accountStatus === "error" ? "has-error" : ""}`}>
          <Hash size={20} />
          <input id="account" name="account" type="text" inputMode="numeric" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={12} placeholder="Например, 1911" value={props.account} onChange={(event) => props.onAccountChange(event.target.value.replace(/\D/g, ""))} />
          {props.account ? <button type="button" onClick={props.onClear} aria-label="Очистить"><X size={17} /></button> : null}
        </div>
        <button className="button button-primary button-full" type="submit" disabled={!canSearch}>{props.accountStatus === "loading" ? <><span className="button-loader" /> Ищем объект...</> : <><Search size={18} /> Найти объект</>}</button>
      </form>}
      {props.accountStatus === "error" && <div className="error-card"><CircleAlert size={20} /><div><strong>Лицевой счёт не найден</strong><p>Проверьте номер и повторите поиск.</p></div></div>}
      {props.accountStatus === "found" && props.accountDetails && <section className="object-card">
        <div className="object-head"><span><Check size={20} /></span><div><small>ЛИЦЕВОЙ СЧЁТ ПОДТВЕРЖДЁН</small><strong>Объект найден</strong></div></div>
        <div className="object-address"><MapPin size={19} /><div><small>Адрес объекта</small><strong>{props.accountDetails.address}</strong></div></div>
        <div className="object-grid">
          <div><small>Квартира</small><strong>{props.accountDetails.unit || "—"}</strong></div>
          <div><small>Счёт</small><strong>{props.account}</strong></div>
        </div>
        {props.variant === "survey" && <>
          <label className="field-label" htmlFor="owner-name">ФИО собственника</label>
          <div className="account-input name-input">
            <UserRound size={19} />
            <input id="owner-name" name="ownerName" type="text" autoComplete="name" autoCorrect="off" spellCheck={false} placeholder="Введите ФИО" value={props.fullName} onChange={(event) => props.onFullNameChange(event.target.value)} />
          </div>
        </>}
        <button className="button button-primary button-full" disabled={!canContinue || props.submitting} onClick={props.onContinue}>
          {props.submitting ? "Открываем голосование..." : props.variant === "property" ? <>Показать опросы <ArrowRight size={18} /></> : <>Перейти к голосованию <ArrowRight size={18} /></>}
        </button>
      </section>}
    </main>
  </>;
}

function OwnerVoteScreen(props: {
  questions: Survey["questions"];
  questionIndex: number;
  answers: (Answer | null)[];
  saveStatus: SaveStatus;
  onBack: () => void;
  onSelect: (answer: Answer) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const current = props.questions[props.questionIndex];
  const total = props.questions.length;
  const selected = props.answers[props.questionIndex];
  return <>
    <AppHeader title="Голосование" onBack={props.onBack} action={<span className="nav-counter">{props.questionIndex + 1}/{total}</span>} />
    <main className="screen-content vote-content">
      <div className="progress-label"><span>Вопрос {props.questionIndex + 1} из {total}</span><strong>{Math.round(((props.questionIndex + 1) / total) * 100)}%</strong></div>
      <div className="progress-track"><span style={{ width: `${((props.questionIndex + 1) / total) * 100}%` }} /></div>
      <div className="question-number">{String(props.questionIndex + 1).padStart(2, "0")}</div>
      <span className="eyebrow">{current.short.toUpperCase()}</span>
      <h1>{current.text}</h1>
      <p className="choice-label">Выберите один вариант ответа <span aria-live="polite" data-testid="save-status">{props.saveStatus === "saved" ? "· Сохранено" : props.saveStatus === "error" ? "· Ошибка сохранения" : ""}</span></p>
      <div className="answer-list">{(["За", "Против", "Воздержусь"] as Answer[]).map((answer) => <button className={`answer-card ${selected === answer ? "selected" : ""}`} key={answer} onClick={() => props.onSelect(answer)}><span className="radio-mark">{selected === answer && <Check size={15} />}</span><span><strong>{answer}</strong><small>{answer === "За" ? "Поддерживаю предложение" : answer === "Против" ? "Не поддерживаю предложение" : "Не принимаю сторону"}</small></span></button>)}</div>
      <div className="vote-navigation"><button className="button button-secondary" onClick={props.onPrev}><ArrowLeft size={18} /> Назад</button><button className="button button-primary" disabled={!selected} onClick={props.onNext}>{props.questionIndex === total - 1 ? "Проверить" : "Далее"} <ArrowRight size={18} /></button></div>
    </main>
  </>;
}

function OwnerLoginScreen(props: {
  phone: string;
  email: string;
  emailMode: boolean;
  submitting: boolean;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onRequestPhone: () => void;
  onRequestEmail: () => void;
  onEgov: () => void;
  onDigitalId: () => void;
  onToggleEmail: () => void;
}) {
  const phoneReady = kzPhoneDigits(props.phone).length >= 11;
  return <>
    <div className="login-hero"><Brand /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-building"><Building2 size={72} /></div></div>
    <main className="screen-content login-content">
      <span className="eyebrow">ВХОД СОБСТВЕННИКА</span>
      <h1>Опросы собственников</h1>
      <p className="lead">Введите номер телефона, чтобы получить код</p>
      <form className="phone-login" onSubmit={(event) => { event.preventDefault(); if (phoneReady) props.onRequestPhone(); }}>
        <label className="field-label" htmlFor="otp-phone">Телефон</label>
        <div className="account-input">
          <Phone size={20} />
          <span className="phone-prefix">+7</span>
          <input id="otp-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel" autoCorrect="off" spellCheck={false} value={formatKzNational(props.phone)} onChange={(event) => props.onPhoneChange(`+7${event.target.value.replace(/\D/g, "").slice(0, 10)}`)} placeholder="701 000 00 00" />
        </div>
        <button className="button button-primary button-full" type="submit" disabled={props.submitting || !phoneReady}>
          {props.submitting ? "Отправляем код..." : <>Получить код <ArrowRight size={18} /></>}
        </button>
      </form>
      <div className="auth-split">Уже знакомые способы</div>
      <div className="auth-list">
        <button className="auth-button" type="button" onClick={props.onEgov}><span className="auth-icon egov-icon"><Landmark size={21} /></span><span><strong>Войти через eGov</strong><small>Электронная цифровая подпись</small></span><ChevronRight size={20} /></button>
        <button className="auth-button" type="button" onClick={props.onDigitalId}><span className="auth-icon digital-icon"><Fingerprint size={23} /></span><span><strong>Войти через Digital ID</strong><small>Быстрая проверка личности</small></span><ChevronRight size={20} /></button>
        <button className="auth-button" type="button" onClick={props.onToggleEmail}><span className="auth-icon mail-icon"><Mail size={20} /></span><span><strong>Войти по электронной почте</strong><small>Код на email</small></span><ChevronRight size={20} className={props.emailMode ? "rotate" : ""} /></button>
        {props.emailMode ? <div className="email-panel"><label htmlFor="email">Электронная почта</label><div className="input-shell"><Mail size={18} /><input id="email" type="email" autoComplete="email" value={props.email} onChange={(event) => props.onEmailChange(event.target.value)} placeholder="owner@example.kz" /></div><button className="button button-primary button-full" type="button" disabled={props.submitting || !props.email.includes("@")} onClick={props.onRequestEmail}>Отправить код <ArrowRight size={18} /></button></div> : null}
      </div>
      <Link className="business-entry" href="/admin">Вход для бизнеса</Link>
      <div className="security-note"><LockKeyhole size={15} /><span>Ваши данные защищены и используются только для подтверждения права голоса</span></div>
    </main>
    <footer className="app-footer">Демонстрационная версия · 2026</footer>
  </>;
}

function OwnerVerifyScreen(props: {
  method: AuthMethod;
  step: number;
  masked: string;
  phone: string;
  code: string;
  submitting: boolean;
  onBack: () => void;
  onCodeChange: (value: string) => void;
  onVerifyOtp: () => void;
  onCompleteMock: () => void;
}) {
  if (props.method === "OTP") {
    return <>
      <AppHeader title="Код подтверждения" onBack={props.onBack} />
      <main className="screen-content verify-content">
        <div className="page-icon"><Phone size={27} /></div>
        <span className="eyebrow">ОДНОРАЗОВЫЙ КОД</span>
        <h1>Введите код из сообщения</h1>
        <p className="lead">Код отправлен на {props.masked || props.phone}. В mock-режиме используйте 000000.</p>
        <label className="field-label" htmlFor="otp-code">Код</label>
        <div className="account-input"><Hash size={20} /><input id="otp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={props.code} onChange={(event) => props.onCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
        <button className="button button-primary button-full bottom-cta" disabled={props.submitting || props.code.length < 4} onClick={props.onVerifyOtp}>{props.submitting ? "Проверяем..." : <>Продолжить <ArrowRight size={18} /></>}</button>
      </main>
    </>;
  }
  return <>
    <AppHeader title={props.method} onBack={props.onBack} />
    <main className="screen-content verify-content">
      <div className={`verify-visual ${props.step === 3 ? "is-success" : ""}`}><div className="verify-rings"><span /><span /><span /></div><div className="verify-icon">{props.step === 3 ? <Check size={42} /> : <UserRoundCheck size={42} />}</div></div>
      <span className="eyebrow">БЕЗОПАСНАЯ АВТОРИЗАЦИЯ</span>
      <h1>{props.step === 3 ? "Личность подтверждена" : "Проверяем ваши данные"}</h1>
      <p className="lead">{props.step === 3 ? "Данные успешно получены. Можно продолжить." : "Это займёт всего несколько секунд"}</p>
      <div className="verify-steps">{["Проверка личности", "Получение данных", "Подтверждение"].map((label, index) => <div className={`verify-row ${props.step > index ? "done" : props.step === index ? "current" : ""}`} key={label}><span className="verify-step-icon">{props.step > index ? <Check size={15} /> : index + 1}</span><span>{label}</span>{props.step === index && props.step < 3 && <span className="mini-loader" />}</div>)}</div>
      <button className="button button-primary button-full bottom-cta" disabled={props.step < 3} onClick={props.onCompleteMock}>Продолжить <ArrowRight size={18} /></button>
    </main>
  </>;
}

function OwnerSignScreen(props: {
  protocol: string;
  questionCount: number;
  objectLabel: string;
  ownerName: string;
  signature: string;
  contactPhone: string;
  contactEmail: string;
  signatureOpen: boolean;
  confirmOpen: boolean;
  submitting: boolean;
  onBack: () => void;
  onOpenSignature: () => void;
  onCancelSignature: () => void;
  onSaveSignature: (value: string) => void;
  onContactPhoneChange: (value: string) => void;
  onContactEmailChange: (value: string) => void;
  onOpenConfirm: () => void;
  onCancelConfirm: () => void;
  onSubmit: () => void;
}) {
  const contactsReady = Boolean(toE164Kz(props.contactPhone) || props.contactEmail.trim());
  return <>
    <AppHeader title="Подтверждение" onBack={props.onBack} />
    <main className="screen-content sign-content">
      <StepDots step={4} />
      <div className="page-icon"><PenLine size={27} /></div>
      <h1>Подтвердите голосование</h1>
      <p className="lead">Рукописная подпись пока является только визуальным UX-элементом и не является ЭЦП</p>
      <section className="sign-summary">
        <div><FileText size={20} /><span><small>Документ</small><strong>Протокол №{props.protocol} · {props.questionCount} ответов</strong></span></div>
        <div><MapPin size={20} /><span><small>Объект</small><strong>{props.objectLabel}</strong></span></div>
        <div><ShieldCheck size={20} /><span><small>ФИО собственника</small><strong>{props.ownerName}</strong></span></div>
      </section>
      <section className={`signature-preview ${props.signature ? "has-signature" : ""}`}>
        {props.signature ? <img src={props.signature} alt="Ваша подпись" /> : <><div className="dashed-pen"><PenLine size={29} /></div><strong>Подпись ещё не добавлена</strong><small>Нажмите кнопку ниже и распишитесь пальцем</small></>}
      </section>
      <button className={`button button-full ${props.signature ? "button-secondary" : "button-primary"}`} onClick={props.onOpenSignature}>
        {props.signature ? <><RotateCcw size={18} /> Перерисовать подпись</> : <><PenLine size={18} /> Добавить визуальную подпись</>}
      </button>
      <p className="field-label">Контактные данные</p>
      <label className="field-label" htmlFor="contact-phone">Телефон</label>
      <div className="account-input">
        <Phone size={19} />
        <span className="phone-prefix">+7</span>
        <input
          id="contact-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          autoCorrect="off"
          spellCheck={false}
          value={formatKzNational(props.contactPhone)}
          onChange={(event) => props.onContactPhoneChange(kzPhoneFromInput(event.target.value))}
          placeholder="701 000 00 00"
        />
      </div>
      <label className="field-label" htmlFor="contact-email">Email</label>
      <div className="account-input">
        <Mail size={19} />
        <input
          id="contact-email"
          type="email"
          autoComplete="email"
          value={props.contactEmail}
          onChange={(event) => props.onContactEmailChange(event.target.value)}
          placeholder="name@example.kz"
        />
      </div>
      <div className="legal-note"><LockKeyhole size={16} /><span>Юридический signing lifecycle будет подключён отдельным этапом. Сейчас сервер фиксирует только ответы.</span></div>
      <button className="button button-primary button-full" disabled={!props.signature || !contactsReady} onClick={props.onOpenConfirm}>
        <Send size={18} /> Подтверждаю голосование
      </button>
    </main>
    {props.signatureOpen && <SignaturePad onCancel={props.onCancelSignature} onSave={props.onSaveSignature} />}
    {props.confirmOpen && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="confirm-modal"><div className="modal-icon"><ShieldCheck size={26} /></div><h2>Подтверждение</h2><p>Вы ответили на все вопросы. Сервер повторно проверит полноту и право голоса.</p><div className="modal-summary"><span>Протокол №{props.protocol}</span><strong>{props.questionCount} ответов</strong></div><button className="button button-primary button-full" disabled={props.submitting} onClick={props.onSubmit}>{props.submitting ? "Отправляем..." : "Отправить голосование"} <Send size={18} /></button><button className="button button-ghost button-full" disabled={props.submitting} onClick={props.onCancelConfirm}>Отмена</button></div></div>}
  </>;
}

function routeFromPath(pathname: string): { screen: Screen; surveyId?: string; archiveId?: string } | null {
  if (pathname === "/login") return { screen: "login" };
  if (pathname === "/auth/verify") return { screen: "verify" };
  if (pathname === "/property") return { screen: "property" };
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
  const [otpPhone, setOtpPhone] = useState(DEMO_OWNER_PHONE);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("whatsapp");
  const [otpCode, setOtpCode] = useState("");
  const [otpChallengeId, setOtpChallengeId] = useState("");
  const [otpMasked, setOtpMasked] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [account, setAccount] = useState("");
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("idle");
  const [accountDetails, setAccountDetails] = useState<{ address: string; unit: string } | null>(null);
  const [surveyCatalog, setSurveyCatalog] = useState<Survey[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState("");
  const [selectedArchiveId, setSelectedArchiveId] = useState(archivedSheets[0].id);
  const [ownerSheets, setOwnerSheets] = useState<ArchivedSheet[]>([]);
  const [answers, setAnswers] = useState<(Answer | null)[]>([]);
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
  const saveJobs = useRef(new Map<number, Promise<void>>());
  const [hydrated, setHydrated] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [declaredName, setDeclaredName] = useState("");
  const nameSeeded = useRef(false);
  const accountDigits = account.replace(/\D/g, "");
  const selectedSurvey = surveyCatalog.find((survey) => survey.id === selectedSurveyId) || surveyCatalog[0] || noSurvey;
  const strandedOnSurvey = catalogLoaded && surveyScreens.includes(screen) && !surveyCatalog.some((survey) => survey.id === selectedSurveyId);
  const accountGateScreens: Screen[] = ["dashboard", "archive", "archiveDocument", ...surveyScreens];
  const needsAccount = authStatus === "authenticated" && accountStatus !== "found" && accountGateScreens.includes(screen);
  const visibleScreen: Screen = strandedOnSurvey
    ? (accountStatus === "found" ? "dashboard" : "property")
    : needsAccount ? "property" : screen;
  const archiveSheets = [...ownerSheets, ...archivedSheets.filter((sheet) => !ownerSheets.some((owned) => owned.protocol === sheet.protocol))];
  const selectedArchive = archiveSheets.find((sheet) => sheet.id === selectedArchiveId) || archiveSheets[0];
  const latestSheet = ownerSheets[0] ?? archivedSheets[0];
  const questions = selectedSurvey.questions;
  const documentId = finalizedDocumentId || activeVoteId || `AERC-VOTE-2026-${selectedSurvey.protocol.padStart(6, "0")}52`;

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const state = saved ? JSON.parse(saved) as { screen?: Screen; selectedSurveyId?: string; selectedArchiveId?: string } : {};
        const route = routeFromPath(window.location.pathname);
        setSelectedSurveyId(route?.surveyId || state.selectedSurveyId || "");
        setSelectedArchiveId(route?.archiveId || state.selectedArchiveId || archivedSheets[0].id);
        const initial = route?.screen || state.screen;
        if (initial) setScreen(initial);
      } catch { localStorage.removeItem(STORAGE_KEY); }
      setHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ screen: visibleScreen, selectedSurveyId, selectedArchiveId }));
  }, [visibleScreen, selectedSurveyId, selectedArchiveId, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    void fetch("/api/session", { cache: "no-store" }).then(async (response) => {
      if (response.ok) {
        const payload = await response.json() as { user?: { displayName?: string } };
        if (payload.user?.displayName && !nameSeeded.current) {
          setOwnerName(payload.user.displayName);
          nameSeeded.current = true;
        }
        setAuthStatus("authenticated");
        return;
      }
      setAuthStatus("anonymous");
      if (!(["login", "verify"] as Screen[]).includes(screen)) {
        setScreen("login"); window.history.replaceState({}, "", "/login");
      }
    }).catch(() => {
      setAuthStatus("anonymous"); setScreen("login"); window.history.replaceState({}, "", "/login");
    });
  }, [hydrated, screen]);
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    void fetch("/api/surveys", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { surveys: AvailableSurveyDto[] };
      const catalog = payload.surveys.map(fromAvailableSurvey);
      setSurveyCatalog(catalog);
      const route = routeFromPath(window.location.pathname);
      if (route?.surveyId) {
        const routed = catalog.find((survey) => survey.id === route.surveyId);
        if (routed) { setSelectedSurveyId(routed.id); setAnswers(defaultAnswers(routed)); }
      }
    }).catch(() => undefined).finally(() => setCatalogLoaded(true));
    void fetch("/api/documents", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { documents: OwnerDocumentDto[] };
      setOwnerSheets(payload.documents.map(fromOwnerDocument));
    }).catch(() => undefined);
  }, [authStatus]);
  useEffect(() => {
    if (strandedOnSurvey) window.history.replaceState({}, "", accountStatus === "found" ? "/dashboard" : "/property");
  }, [strandedOnSurvey, accountStatus]);
  useEffect(() => {
    if (needsAccount) window.history.replaceState({}, "", "/property");
  }, [needsAccount]);
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
    if (screen !== "verify" || authMethod === "OTP") return;
    const timers = [setTimeout(() => setVerifyStep(1), 450), setTimeout(() => setVerifyStep(2), 1000), setTimeout(() => setVerifyStep(3), 1600)];
    return () => timers.forEach(clearTimeout);
  }, [screen, authMethod]);

  const go = (next: Screen, replace = false) => {
    setScreen(next); window.scrollTo({ top: 0, behavior: "smooth" });
    window.history[replace ? "replaceState" : "pushState"]({}, "", pathFor(next, selectedSurveyId, selectedArchiveId));
  };
  const openSurvey = (surveyId: string, next: "intro" | "preview") => {
    const survey = surveyCatalog.find((item) => item.id === surveyId) || surveyCatalog[0];
    idempotencyKey.current = "";
    saveJobs.current = new Map();
    setActiveVoteId(""); setFinalizedDocumentId(""); setSaveStatus("idle"); setSelectedSurveyId(survey.id); setAnswers(defaultAnswers(survey)); setSignature(""); setSubmittedAt(""); setQuestionIndex(0); setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" }); window.history.pushState({}, "", pathFor(next, survey.id, selectedArchiveId));
  };
  const openArchive = (archiveId: string) => {
    setSelectedArchiveId(archiveId); setScreen("archiveDocument"); window.scrollTo({ top: 0, behavior: "smooth" });
    window.history.pushState({}, "", pathFor("archiveDocument", selectedSurveyId, archiveId));
  };
  const findAccount = async () => {
    if (!/^\d{4,32}$/.test(accountDigits)) return;
    setAccountStatus("loading");
    try {
      const response = await fetch("/api/personal-accounts/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountReference: accountDigits }),
      });
      if (!response.ok) throw new Error("Account resolution failed");
      const data = await response.json() as { account: { accountNumber: string; address: string; unit: string } };
      setAccount(data.account.accountNumber);
      setAccountDetails({ address: data.account.address, unit: data.account.unit });
      setAccountStatus("found");
      setToast("Объект успешно подтверждён");
    } catch {
      setAccountStatus("error");
    }
  };
  const logout = async () => {
    await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
    localStorage.removeItem(STORAGE_KEY); setAuthStatus("anonymous"); setActiveVoteId(""); setFinalizedDocumentId(""); setSurveyCatalog([]); setOwnerSheets([]); setSelectedSurveyId(""); setAnswers([]); setAccount(""); setAccountDetails(null); setSignature(""); setSubmittedAt(""); setAccountStatus("idle"); setDeclaredName(""); nameSeeded.current = false; go("login", true);
  };
  const completeAuthentication = async () => {
    const response = await fetch("/api/dev/session", { method: "POST", credentials: "same-origin" });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      setToast(body?.error?.message || "Не удалось войти. Откройте деплой на Vercel, не localhost.");
      return;
    }
    setAuthStatus("authenticated");
    setToast("Добро пожаловать!");
    go("property");
  };
  const requestOtp = async (destination: string, channel: OtpChannel) => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination, channel }),
      });
      const payload = await response.json().catch(() => null) as { challengeId?: string; maskedDestination?: string; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message || "otp");
      setOtpChannel(channel);
      setOtpChallengeId(payload?.challengeId ?? "");
      setOtpMasked(payload?.maskedDestination ?? "");
      setAuthMethod("OTP");
      setOtpCode(DEMO_OWNER_OTP);
      go("verify");
    } catch (cause) {
      setToast(cause instanceof Error && cause.message !== "otp" ? cause.message : "Не удалось отправить код. Попробуйте eGov или Digital ID.");
    } finally {
      setSubmitting(false);
    }
  };
  const verifyOtp = async () => {
    setSubmitting(true);
    try {
      const destination = otpChannel === "email" ? otpEmail : otpPhone;
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: otpChallengeId, code: otpCode, destination, channel: otpChannel }),
      });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message || "otp");
      setAuthStatus("authenticated");
      setToast("Добро пожаловать!");
      go("property");
    } catch (cause) {
      setToast(cause instanceof Error && cause.message !== "otp" ? cause.message : "Не удалось проверить код. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };
  const flushSaves = () => Promise.allSettled([...saveJobs.current.values()]);
  const refreshOwnerData = async () => {
    const [surveysResponse, documentsResponse] = await Promise.all([
      fetch("/api/surveys", { cache: "no-store" }),
      fetch("/api/documents", { cache: "no-store" }),
    ]);
    if (surveysResponse.ok) {
      const payload = await surveysResponse.json() as { surveys: AvailableSurveyDto[] };
      setSurveyCatalog(payload.surveys.map(fromAvailableSurvey));
    }
    if (documentsResponse.ok) {
      const payload = await documentsResponse.json() as { documents: OwnerDocumentDto[] };
      setOwnerSheets(payload.documents.map(fromOwnerDocument));
    }
  };
  const startVoting = async () => {
    if (!isDeclaredNameComplete(declaredName)) { setToast("Введите ФИО собственника"); return; }
    if (!selectedSurvey.backendId) { setToast("Опрос ещё не опубликован в backend"); return; }
    setOwnerName(declaredName.trim());
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
  const saveAnswer = (index: number, answer: Answer) => {
    const questionId = questions[index]?.id;
    if (!activeVoteId || !questionId) return;
    setAnswers((current) => {
      const next = [...current];
      next[index] = answer;
      return next;
    });
    setSaveStatus("idle");
    const voteId = activeVoteId;
    const prior = saveJobs.current.get(index) ?? Promise.resolve();
    const job = prior.catch(() => undefined).then(async () => {
      const choices = { "За": "for", "Против": "against", "Воздержусь": "abstain" } as const;
      const response = await fetch(`/api/votes/${voteId}/answers`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), questionId, choice: choices[answer] }),
      });
      if (!response.ok) throw new Error("Autosave failed");
      setSaveStatus("saved");
    }).catch(() => {
      setSaveStatus("error");
      setToast("Ответ не сохранён. Повторите выбор");
    });
    saveJobs.current.set(index, job);
  };
  const submitVote = async () => {
    if (!activeVoteId) {
      setToast("Черновик голосования не найден");
      return;
    }
    setSubmitting(true);
    idempotencyKey.current ||= crypto.randomUUID();
    try {
      await flushSaves();
      const phone = toE164Kz(contactPhone);
      const email = contactEmail.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Укажите корректный email");
      }
      if (!phone && !email) {
        throw new Error("Укажите телефон или email");
      }
      const contactsResponse = await fetch(`/api/votes/${activeVoteId}/contacts`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: phone || undefined, email: email || undefined, fullName: declaredName.trim() || undefined }),
      });
      if (!contactsResponse.ok) throw new Error(await apiErrorMessage(contactsResponse, "Контактные данные не сохранены"));
      if (signature) {
        const signatureResponse = await fetch(`/api/votes/${activeVoteId}/visual-signature`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataUrl: signature }),
        });
        if (!signatureResponse.ok) throw new Error(await apiErrorMessage(signatureResponse, "Не удалось сохранить подпись"));
      }
      const response = await fetch(`/api/votes/${activeVoteId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: idempotencyKey.current }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Голосование не отправлено"));
      const result = await response.json() as { document: { id: string } };
      setFinalizedDocumentId(result.document.id);
      setSurveyCatalog((current) => current.map((survey) => survey.id === selectedSurveyId ? { ...survey, status: "complete" } : survey));
      setOwnerSheets((current) => {
        const sheet: ArchivedSheet = {
          id: result.document.id,
          protocol: selectedSurvey.protocol,
          title: selectedSurvey.title,
          date: new Date().toLocaleDateString("ru-RU"),
          time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
          documentId: result.document.id,
          address: accountDetails?.address || "г. Астана, ул. Геодезическая, д. 12",
          account: account || "1911",
          apartment: accountDetails?.unit || "52",
          questions,
          answers,
        };
        return [sheet, ...current.filter((item) => item.id !== sheet.id)];
      });
      setConfirmOpen(false);
      setSubmittedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
      setToast("Голосование отправлено");
      void refreshOwnerData();
      setTimeout(() => go("success"), 300);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Не удалось отправить голосование");
    } finally {
      setSubmitting(false);
    }
  };

  const completed = answers.filter(Boolean).length;
  const Dashboard = () => <><AppHeader action={<button className="text-action" onClick={logout}>Выйти</button>} /><main className="screen-content dashboard-content">
    <div className="welcome-row"><div><p>Здравствуйте</p><h1>Мои опросы</h1></div><div className="avatar">{displayNameInitials(ownerName)}</div></div>
    <section className="profile-card"><div className="profile-icon"><Building2 size={24} /></div><div className="profile-main"><small>Собственник</small><strong>{ownerName}</strong><span>{accountDetails ? `${accountDetails.address} · кв. ${accountDetails.unit}` : `Лицевой счёт ${account}`}</span></div><div className="verified-badge"><ShieldCheck size={14} /> Объект подтверждён</div></section>
    <div className="section-heading"><h2>Доступные опросы</h2><span>{surveyCatalog.filter((survey) => survey.status === "active" || survey.status === "complete").length}</span></div>
    {surveyCatalog.length === 0 && <section className="survey-card survey-soon"><h3>{noSurvey.title}</h3><p className="survey-description">{noSurvey.subtitle}</p></section>}
    <div className="survey-stack">{surveyCatalog.map((survey) => <section className={`survey-card ${survey.status === "complete" ? "survey-complete" : survey.status === "active" ? "survey-active" : "survey-soon"}`} key={survey.id}><div className="survey-top"><span className={`status-badge ${survey.status === "complete" ? "complete" : survey.status === "active" ? "new" : "scheduled"}`}>{survey.status === "complete" ? "Завершён" : survey.status === "active" ? "Открыт" : "Скоро"}</span><div className="survey-symbol"><Vote size={24} /></div></div><small className="protocol">ПРОТОКОЛ №{survey.protocol}</small><h3>{survey.title}</h3><p className="survey-description">{survey.subtitle}</p><div className="survey-meta"><span><CalendarDays size={16} /> {survey.deadline}</span><span><ClipboardCheck size={16} /> {survey.questions.length} вопросов</span></div><div className="survey-actions"><button className="button button-secondary" onClick={() => openSurvey(survey.id, "preview")}><FileText size={17} /> Посмотреть</button>{survey.status === "complete" ? <button className="button button-primary" onClick={() => openSurvey(survey.id, "intro")}>Открыть <ArrowRight size={18} /></button> : survey.status === "active" ? <button className="button button-primary" onClick={() => openSurvey(survey.id, "intro")}>Пройти <ArrowRight size={18} /></button> : <button className="button button-muted" disabled>Скоро</button>}</div></section>)}</div>
    <div className="section-heading archive-heading"><h2>Мои опросные листы</h2><button className="text-action" onClick={() => go("archive")}>Все листы <ChevronRight size={15} /></button></div>
    <section className="survey-card survey-complete"><div><span className="status-badge complete"><CheckCircle2 size={13} /> Завершён</span><small>ПРОТОКОЛ №{latestSheet.protocol}</small></div><h3>{latestSheet.title}</h3><p>Голосование завершено {latestSheet.date}</p><button className="archive-open" onClick={() => openArchive(latestSheet.id)}><FileText size={16} /> Открыть опросный лист <ChevronRight size={16} /></button></section>
  </main></>;

  const ArchiveView = () => <><AppHeader title="Мои опросные листы" onBack={() => go("dashboard")} /><main className="screen-content archive-content">
    <div className="archive-hero"><div className="page-icon"><Archive size={27} /></div><div><span className="eyebrow">АРХИВ ДОКУМЕНТОВ</span><h1>История голосований</h1></div></div>
    <p className="lead">Все подписанные вами листы хранятся в профиле и доступны для просмотра или печати.</p>
    <div className="archive-summary"><div><strong>{archiveSheets.length}</strong><span>документа</span></div><div><strong>2026</strong><span>текущий год</span></div><ShieldCheck size={24} /></div>
    <div className="archive-list">{archiveSheets.map((sheet) => <article className="archive-card" key={sheet.id}><div className="archive-card-icon"><FileText size={22} /></div><div className="archive-card-copy"><div><span className="status-badge complete"><CheckCircle2 size={12} /> Подписан</span><small>ПРОТОКОЛ №{sheet.protocol}</small></div><h2>{sheet.title}</h2><p><CalendarDays size={14} /> {sheet.date} · {sheet.questions.length} вопроса</p><strong className="archive-document-id">{sheet.documentId}</strong></div><button className="archive-card-button" onClick={() => openArchive(sheet.id)} aria-label={`Открыть лист к протоколу №${sheet.protocol}`}><ChevronRight size={19} /></button></article>)}</div>
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

  const Review = () => <><AppHeader title="Проверка" onBack={() => { setQuestionIndex(questions.length - 1); go("vote"); }} /><main className="screen-content review-content"><StepDots step={3} /><div className="page-icon success-soft"><ClipboardCheck size={27} /></div><h1>Проверьте ответы</h1><p className="lead">При необходимости вернитесь к вопросу и измените выбор</p>
    <div className="review-list">{questions.map((question, index) => <button key={question.short} onClick={() => { setQuestionIndex(index); go("vote"); }}><span className="review-number">{index + 1}</span><span className="review-copy"><strong>{question.short}</strong><small>{question.text}</small></span><span className={`answer-pill ${answers[index] === "За" ? "yes" : answers[index] === "Против" ? "no" : "neutral"}`}>{answers[index] || "Не выбран"}</span><ChevronRight size={17} /></button>)}</div>
    <div className="completion-note"><CheckCircle2 size={18} /><strong>{completed} из {questions.length} вопросов заполнено</strong></div><button className="button button-primary button-full" disabled={completed !== questions.length} onClick={() => go("sign")}><PenLine size={18} /> Перейти к подтверждению</button>
  </main></>;

  const Success = () => <><AppHeader /><main className="screen-content success-content"><div className="success-animation"><span /><div><Check size={45} /></div><i /><i /><i /><i /></div><span className="eyebrow success-eyebrow">ГОЛОСОВАНИЕ ЗАВЕРШЕНО</span><h1>Голос принят</h1><p className="lead">Ваше голосование успешно зарегистрировано.</p>
    <section className="receipt-card"><div className="receipt-row"><span><CalendarDays size={18} /> Дата и время</span><strong>20 августа 2026 · {submittedAt || "14:32"}</strong></div><div className="receipt-row"><span><Hash size={18} /> ID документа</span><strong className="document-id">{documentId}</strong></div><div className="receipt-row"><span><ShieldCheck size={18} /> Статус</span><strong className="green-text">Отправлено и принято</strong></div></section>
    <div className="success-actions"><button className="button button-primary button-full" onClick={() => go("document")}><FileText size={18} /> Открыть демонстрационный лист</button><button className="button button-secondary button-full" onClick={() => go("dashboard")}><Home size={18} /> На главную</button></div><p className="receipt-hint">Ответы и итоговый статус сохранены в PostgreSQL. PDF и ЭЦП относятся к следующему этапу.</p>
  </main></>;

  const Document = () => <VotingSheet onBack={() => go("success")} protocol={selectedSurvey.protocol} title={selectedSurvey.title} date="20.08.2026" time={submittedAt || "14:32"} documentId={documentId} address={accountDetails?.address || "г. Астана, ул. Геодезическая, д. 12"} account={account || "1911"} apartment={accountDetails?.unit || "52"} ownerName={ownerName} questions={questions} answers={answers} signature={signature} />;
  const ArchiveDocument = () => <VotingSheet onBack={() => go("archive")} protocol={selectedArchive.protocol} title={selectedArchive.title} date={selectedArchive.date} time={selectedArchive.time} documentId={selectedArchive.documentId} address={selectedArchive.address} account={selectedArchive.account} apartment={selectedArchive.apartment} ownerName={DEMO_OWNER_FULL_NAME} questions={selectedArchive.questions} answers={selectedArchive.answers} archived />;

  const content = () => {
    if (questionScreens.includes(visibleScreen) && questions.length === 0) return <div className="app-loading"><Brand /><span className="loader-ring" /></div>;
    switch (visibleScreen) {
      case "login": return <OwnerLoginScreen
        phone={otpPhone}
        email={otpEmail}
        emailMode={emailMode}
        submitting={submitting}
        onPhoneChange={setOtpPhone}
        onEmailChange={setOtpEmail}
        onRequestPhone={() => { void requestOtp(otpPhone, "whatsapp"); }}
        onRequestEmail={() => { void requestOtp(otpEmail, "email"); }}
        onEgov={() => { setVerifyStep(0); setAuthMethod("eGov"); go("verify"); }}
        onDigitalId={() => { setVerifyStep(0); setAuthMethod("Digital ID"); go("verify"); }}
        onToggleEmail={() => setEmailMode((current) => !current)}
      />;
      case "verify": return <OwnerVerifyScreen
        method={authMethod}
        step={verifyStep}
        masked={otpMasked}
        phone={otpPhone}
        code={otpCode}
        submitting={submitting}
        onBack={() => go("login")}
        onCodeChange={setOtpCode}
        onVerifyOtp={() => { void verifyOtp(); }}
        onCompleteMock={() => { void completeAuthentication(); }}
      />;
      case "property":
      case "account": return <OwnerAccountScreen
        variant={visibleScreen === "property" ? "property" : "survey"}
        account={account}
        accountStatus={accountStatus}
        accountDetails={accountDetails}
        fullName={declaredName}
        submitting={submitting}
        onAccountChange={(value) => { setAccount(value); setAccountStatus("idle"); }}
        onClear={() => { setAccount(""); setAccountDetails(null); setAccountStatus("idle"); }}
        onFind={() => { void findAccount(); }}
        onFullNameChange={setDeclaredName}
        onLogout={() => { void logout(); }}
        onBack={() => go("intro")}
        onContinue={() => { if (visibleScreen === "property") go("dashboard"); else void startVoting(); }}
      />;
      case "dashboard": return <Dashboard />;
      case "archive": return <ArchiveView />;
      case "archiveDocument": return <ArchiveDocument />;
      case "intro": return <Intro />;
      case "preview": return <Preview />;
      case "vote": return <OwnerVoteScreen
        questions={questions}
        questionIndex={questionIndex}
        answers={answers}
        saveStatus={saveStatus}
        onBack={() => questionIndex > 0 ? setQuestionIndex(questionIndex - 1) : go("account")}
        onSelect={(answer) => saveAnswer(questionIndex, answer)}
        onPrev={() => questionIndex > 0 ? setQuestionIndex(questionIndex - 1) : go("account")}
        onNext={() => questionIndex === questions.length - 1 ? go("review") : setQuestionIndex(questionIndex + 1)}
      />;
      case "review": return <Review />;
      case "sign": return <OwnerSignScreen
        protocol={selectedSurvey.protocol}
        questionCount={questions.length}
        objectLabel={accountDetails ? `${accountDetails.address}, кв. ${accountDetails.unit}` : "ул. Геодезическая, 12, кв. 52"}
        ownerName={ownerName}
        signature={signature}
        contactPhone={contactPhone}
        contactEmail={contactEmail}
        signatureOpen={signatureOpen}
        confirmOpen={confirmOpen}
        submitting={submitting}
        onBack={() => go("review")}
        onOpenSignature={() => setSignatureOpen(true)}
        onCancelSignature={() => setSignatureOpen(false)}
        onSaveSignature={(value) => { setSignature(value); setSignatureOpen(false); setToast("Визуальная подпись добавлена"); }}
        onContactPhoneChange={setContactPhone}
        onContactEmailChange={setContactEmail}
        onOpenConfirm={() => setConfirmOpen(true)}
        onCancelConfirm={() => setConfirmOpen(false)}
        onSubmit={() => { void submitVote(); }}
      />;
      case "success": return <Success />;
      case "document": return <Document />;
    }
  };
  if (!hydrated || authStatus === "checking") return <div className="app-loading"><Brand /><span className="loader-ring" /></div>;
  if (visibleScreen === "document" || visibleScreen === "archiveDocument") return <div className="presentation document-presentation">{content()}{toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}</div>;
  return <div className="presentation"><aside className="presentation-copy"><Brand /><div className="presentation-main"><span className="presentation-tag"><ShieldCheck size={15} /> ЦИФРОВОЙ СЕРВИС</span><h2>Голосовать удобно.<br />Решать — вместе.</h2><p>Безопасный и прозрачный способ участия собственников в управлении своим домом.</p><div className="presentation-points"><span><Check size={15} /> Подтверждение личности</span><span><Check size={15} /> Электронный документ</span><span><Check size={15} /> Рукописная подпись</span></div></div><div className="presentation-footer">ТОО «Астана-ЕРЦ» · 2026</div></aside><div className="phone-stage"><div className={`phone-shell screen-${visibleScreen}`}>{content()}</div><p className="desktop-caption">Интерактивный демонстрационный прототип</p></div>{toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}</div>;
}

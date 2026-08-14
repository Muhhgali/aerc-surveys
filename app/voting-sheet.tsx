"use client";

/* eslint-disable @next/next/no-img-element -- Signature images are runtime canvas data URLs. */

import { ArrowLeft, Printer, ShieldCheck } from "lucide-react";
import type { Answer, SurveyQuestion } from "./survey-data";

type VotingSheetProps = {
  onBack: () => void;
  protocol: string;
  title: string;
  date: string;
  time: string;
  documentId: string;
  address: string;
  account: string;
  apartment: string;
  questions: SurveyQuestion[];
  answers: (Answer | null)[];
  signature?: string;
  archived?: boolean;
};

function HandwrittenSignature({ compact = false }: { compact?: boolean }) {
  return <svg className={`handwritten-signature ${compact ? "compact" : ""}`} viewBox="0 0 180 64" role="img" aria-label="Рукописная подпись собственника">
    <path d="M8 43C18 8 31 11 25 38c-5 22 16 10 25-13 5-13 5 23 16 16 12-8 9-21 17-16 11 8-2 27 16 17 12-7 12-25 18-19 9 9-7 28 14 19 13-6 15-18 22-11 7 7-5 18 19 8" />
    <path d="M18 52c42 5 92 3 153-5" />
  </svg>;
}

export function VotingSheet({ onBack, protocol, title, date, time, documentId, address, account, apartment, questions, answers, signature, archived = false }: VotingSheetProps) {
  return <div className="document-view"><div className="document-toolbar no-print"><button className="icon-button" onClick={onBack} aria-label="Назад"><ArrowLeft size={20} /></button><div><strong>{title}</strong><small>A4 книжный · {archived ? "архивный лист" : "готов к печати"}</small></div><button className="button button-primary print-button" onClick={() => window.print()}><Printer size={17} /> Печать / PDF</button></div>
    <article className="a4-document"><header className="paper-header"><div className="brand brand-compact"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div className="brand-copy"><strong>АСТАНА-ЕРЦ</strong></div></div><div className="paper-stamp"><ShieldCheck size={14} /> ЭЛЕКТРОННЫЙ ДОКУМЕНТ</div></header><div className="paper-title"><span>ТОО «Астана-ЕРЦ»</span><h1>ЛИСТ ГОЛОСОВАНИЯ №1</h1><p>к Протоколу №{protocol}: {title}</p></div>
      <section className="paper-details"><div><small>Дата проведения</small><strong>{date}</strong></div><div className="wide"><small>Местонахождение многоквартирного жилого дома</small><strong>{address}</strong></div><div><small>Лицевой счёт</small><strong>{account}</strong></div><div><small>Квартира</small><strong>{apartment}</strong></div></section>
      <table className="vote-table"><thead><tr><th>№</th><th>Вопросы, внесённые для обсуждения</th><th>За</th><th>Против</th><th>Воздержусь</th></tr></thead><tbody>{questions.map((question, index) => <tr key={question.short}><td>{index + 1}</td><td>{question.text}</td>{(["За", "Против", "Воздержусь"] as Answer[]).map((answer) => <td key={answer} className="signature-cell">{answers[index] === answer && (signature ? <img src={signature} alt="Подпись" /> : <HandwrittenSignature compact />)}</td>)}</tr>)}</tbody></table>
      <section className="owner-info"><h2>Сведения о собственнике</h2><div className="owner-grid"><div><small>Адрес объекта</small><strong>{address}, кв. {apartment}</strong></div><div><small>Лицевой счёт</small><strong>{account}</strong></div><div><small>Дата и время голосования</small><strong>{date} · {time}</strong></div><div><small>ID документа</small><strong>{documentId}</strong></div></div></section>
      <section className="paper-signature"><div><small>Подпись собственника</small>{signature ? <img src={signature} alt="Подпись собственника" /> : <div className="archive-handwritten"><HandwrittenSignature /><span>Рукописная подпись собственника</span></div>}</div><div className="qr-block"><div className="fake-qr">{Array.from({ length: 9 }).map((_, index) => <span key={index} />)}</div><small>Проверка документа</small><strong>{documentId}</strong></div></section><footer className="paper-footer"><span>Сформировано в системе «Астана-ЕРЦ — Опросы»</span><span>Страница 1 из 1</span></footer>
    </article><button className="button button-primary mobile-print no-print" onClick={() => window.print()}><Printer size={18} /> Печать / Сохранить как PDF</button>
  </div>;
}

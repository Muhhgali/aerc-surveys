import { ArrowLeft, BatteryFull, Signal, Wifi } from "lucide-react";
import type { ReactNode } from "react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}>
    <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
    <div className="brand-copy"><strong>АСТАНА-ЕРЦ</strong>{!compact && <small>Городской цифровой сервис</small>}</div>
  </div>;
}

export function AppHeader({ title, onBack, action }: { title?: string; onBack?: () => void; action?: ReactNode }) {
  return <header className="app-header">
    <div className="status-bar" aria-hidden="true"><span>09:41</span><span className="status-icons"><Signal size={12} /><Wifi size={13} /><BatteryFull size={16} /></span></div>
    <div className="nav-bar">
      {onBack ? <button className="icon-button" onClick={onBack} aria-label="Назад"><ArrowLeft size={21} /></button> : <Brand compact />}
      {title && <strong className="nav-title">{title}</strong>}<div className="nav-action">{action}</div>
    </div>
  </header>;
}

export function StepDots({ step }: { step: number }) {
  return <div className="step-dots" aria-label={`Этап ${step} из 4`}>{[1, 2, 3, 4].map((item) => <span key={item} className={item <= step ? "active" : ""} />)}</div>;
}

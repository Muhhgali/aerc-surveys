"use client";

import { Check, PenLine, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function SignaturePad({ onSave, onCancel }: { onSave: (value: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const context = canvas.getContext("2d");
    context?.scale(ratio, ratio);
    if (context) {
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2.7;
      context.strokeStyle = "#172033";
    }
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    const context = canvasRef.current?.getContext("2d");
    context?.beginPath();
    context?.moveTo(x, y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const { x, y } = point(event);
    const context = canvasRef.current?.getContext("2d");
    context?.lineTo(x, y);
    context?.stroke();
    setHasInk(true);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  return <div className="sheet-backdrop" role="dialog" aria-modal="true"><div className="signature-sheet">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onCancel} aria-label="Закрыть"><X size={20} /></button>
    <div className="sheet-icon"><PenLine size={24} /></div><h2>Поставьте подпись</h2><p>Распишитесь пальцем в области ниже</p>
    <div className="canvas-wrap"><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} aria-label="Поле для рукописной подписи" /><span /><small>Подпись собственника</small></div>
    <div className="sheet-actions"><button className="button button-secondary" onClick={clear}><RotateCcw size={18} /> Очистить</button><button className="button button-primary" disabled={!hasInk} onClick={() => canvasRef.current && onSave(canvasRef.current.toDataURL("image/png"))}>Готово <Check size={18} /></button></div>
    {!hasInk && <span className="sheet-hint">Сначала поставьте подпись</span>}
  </div></div>;
}

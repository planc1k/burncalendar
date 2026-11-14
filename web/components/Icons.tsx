// One small icon set: 16px grid, 1.6px stroke, round joins. Filled shapes only for play/pause.
const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const Play = () => <svg {...base} fill="currentColor" stroke="none"><path d="M4.5 2.8v10.4L13 8z" /></svg>;
export const Pause = () => <svg {...base} fill="currentColor" stroke="none"><path d="M4 3h3v10H4zM9 3h3v10H9z" /></svg>;
export const Up = () => <svg {...base}><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" /></svg>;
export const Down = () => <svg {...base}><path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" /></svg>;
export const Level = () => <svg {...base}><path d="M3 8h10" /></svg>;
export const Arrow = () => <svg {...base}><path d="M3 8h10M8.5 3.5 13 8l-4.5 4.5" /></svg>;
export const Draw = () => <svg {...base}><path d="M2.5 2.5h11v11h-11z" strokeDasharray="2.2 2.2" /></svg>;
export const Download = () => <svg {...base}><path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" /></svg>;

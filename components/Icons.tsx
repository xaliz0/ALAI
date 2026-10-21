import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const Send = (p: P) => (
  <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const Stop = (p: P) => (
  <svg {...base(p)}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
);
export const Clip = (p: P) => (
  <svg {...base(p)}><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l9.2-9.2a3.7 3.7 0 015.2 5.2l-9.2 9.2a1.8 1.8 0 01-2.6-2.6l8.5-8.5" /></svg>
);
export const Mic = (p: P) => (
  <svg {...base(p)}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0014 0M12 17v5" /></svg>
);
export const MicOff = (p: P) => (
  <svg {...base(p)}><path d="M3 3l18 18M9 9v1a3 3 0 005.1 2.1M15 9.3V5a3 3 0 00-5.9-.7M19 10a7 7 0 01-1.2 3.9M5 10a7 7 0 0010.9 5.8M12 17v5" /></svg>
);
export const Phone = (p: P) => (
  <svg {...base(p)}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" /></svg>
);
export const Hangup = (p: P) => (
  <svg {...base(p)} style={{ transform: "rotate(135deg)" }}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" fill="currentColor" /></svg>
);
export const Plus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const Menu = (p: P) => (
  <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h10" /></svg>
);
export const Close = (p: P) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const Trash = (p: P) => (
  <svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
);
export const Copy = (p: P) => (
  <svg {...base(p)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
);
export const Check = (p: P) => (
  <svg {...base(p)}><path d="M5 12l5 5L20 7" /></svg>
);
export const Speaker = (p: P) => (
  <svg {...base(p)}><path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" /></svg>
);
export const Download = (p: P) => (
  <svg {...base(p)}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
);
export const FileIcon = (p: P) => (
  <svg {...base(p)}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
);
export const Globe = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>
);
export const BrainIcon = (p: P) => (
  <svg {...base(p)}><path d="M9.5 3A2.5 2.5 0 007 5.5v.2A3 3 0 004.6 10 3 3 0 005 15.5 3 3 0 008 19a2.5 2.5 0 004 .8V4.5A2.5 2.5 0 009.5 3zM14.5 3A2.5 2.5 0 0117 5.5v.2a3 3 0 012.4 4.3 3 3 0 01-.4 5.5 3 3 0 01-3 3.5 2.5 2.5 0 01-4 .8" /><path d="M12 8h2M12 13h3M9 10H7.5M9 15H8" /></svg>
);
export const Shield = (p: P) => (
  <svg {...base(p)}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
);
export const Chevron = (p: P) => (
  <svg {...base(p)}><path d="M8 10l4 4 4-4" /></svg>
);

"use client";

import type { Attachment, ChatMessage, ChatRequest, StreamEvent } from "./types";

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Vercel caps request bodies at ~4.5 MB, so the whole history has to fit under that.
const MAX_PAYLOAD_CHARS = 3_800_000;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const IMAGE_MAX_SIDE = 1600;

const TEXT_EXT = /\.(txt|md|csv|json|js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|rb|php|html|css|xml|yml|yaml|sql|sh|log|ini|toml)$/i;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function shrinkImage(file: File): Promise<{ data: string; mime: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 1_500_000 && file.type !== "image/heic") {
      const d = await readAsDataUrl(file);
      return { data: d.split(",")[1], mime: file.type };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const d = canvas.toDataURL("image/jpeg", 0.86);
    return { data: d.split(",")[1], mime: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.type.startsWith("image/")) {
    const { data, mime } = await shrinkImage(file);
    return { id: uid(), name: file.name || "bild.jpg", mime, size: file.size, kind: "image", data };
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} ist zu groß (max. 3 MB).`);
  }
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const d = await readAsDataUrl(file);
    return { id: uid(), name: file.name, mime: "application/pdf", size: file.size, kind: "pdf", data: d.split(",")[1] };
  }
  if (file.type.startsWith("text/") || TEXT_EXT.test(file.name) || file.type === "application/json") {
    const d = await readAsDataUrl(file);
    return { id: uid(), name: file.name, mime: file.type || "text/plain", size: file.size, kind: "text", data: d.split(",")[1] };
  }
  throw new Error(`${file.name}: Dateityp wird nicht unterstützt (Bilder, PDFs und Textdateien gehen).`);
}

/** Keep the newest attachments' bytes and drop older ones until the request fits. */
function fitPayload(messages: ChatMessage[]): ChatRequest["messages"] {
  let budget = MAX_PAYLOAD_CHARS;
  const out: ChatRequest["messages"] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    budget -= m.text.length;
    const attachments = m.attachments?.map((a) => {
      const len = a.data?.length ?? 0;
      if (len && len <= budget) {
        budget -= len;
        return a;
      }
      return { ...a, data: undefined };
    });
    out.unshift({ role: m.role, text: m.text, attachments });
  }
  return out;
}

export async function streamChat(
  messages: ChatMessage[],
  mode: ChatRequest["mode"],
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
  extra?: Pick<ChatRequest, "profileName" | "memories">,
): Promise<void> {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-alai-code": getAccessCode() },
    body: JSON.stringify({ mode, messages: fitPayload(messages), today, ...extra } satisfies ChatRequest),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `Fehler ${res.status}`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {}
    if (res.status === 401) throw new AccessError(msg);
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as StreamEvent);
    }
  }
}

export class AccessError extends Error {}

// --- access code -----------------------------------------------------------

const CODE_KEY = "alai.code";

export function getAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) || "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string) {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {}
}

// --- files the AI sends back ----------------------------------------------

export type Segment = { type: "md"; text: string } | { type: "file"; name: string; content: string; complete: boolean };

/** Split a reply into markdown and <datei name="…">…</datei> file attachments. */
export function splitFiles(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /<datei\s+name="([^"]+)"\s*>\n?([\s\S]*?)(<\/datei>|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "md", text: text.slice(last, m.index) });
    out.push({ type: "file", name: m[1], content: m[2].replace(/\n$/, ""), complete: m[3] === "</datei>" });
    last = re.lastIndex;
    if (m[3] === "") break;
  }
  if (last < text.length) out.push({ type: "md", text: text.slice(last) });
  return out;
}

/** Plain text for speech: strips markdown, file blocks, links and emojis. */
export function toSpeech(text: string): string {
  return text
    .replace(/<datei[\s\S]*?(<\/datei>|$)/g, " Ich hab dir eine Datei in den Chat gelegt. ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#>`~|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function download(name: string, content: string | Blob, mime = "text/plain") {
  const blob = typeof content === "string" ? new Blob([content], { type: `${mime};charset=utf-8` }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function attachmentBlob(a: Attachment): Blob | null {
  if (!a.data) return null;
  const bin = atob(a.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: a.mime });
}

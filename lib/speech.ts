"use client";

import { toSpeech } from "./client";

/* Thin wrappers around the browser's Web Speech API (speech-to-text + text-to-speech). */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function RecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => Recognition) | null;
}

export const canListen = () => RecognitionCtor() !== null;
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export interface ListenOptions {
  lang?: string;
  continuous?: boolean;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

/** Starts listening; returns a stop function. */
export function listen(opts: ListenOptions): () => void {
  const Ctor = RecognitionCtor();
  if (!Ctor) {
    opts.onError?.("unsupported");
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = opts.lang ?? "de-DE";
  rec.continuous = opts.continuous ?? false;
  rec.interimResults = true;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    opts.onInterim?.((finalText + " " + interim).trim());
  };
  rec.onerror = (e) => opts.onError?.(e.error);
  rec.onend = () => {
    if (finalText.trim()) opts.onFinal(finalText.trim());
    opts.onEnd?.();
  };
  try {
    rec.start();
  } catch {
    opts.onError?.("start-failed");
  }
  return () => {
    try {
      rec.stop();
    } catch {}
  };
}

/** Picks the nicest-sounding German voice the device has. */
function pickVoice(lang = "de"): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
  if (!voices.length) return null;
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online|premium|enhanced/i.test(v.name) ? 4 : 0) +
    (/google/i.test(v.name) ? 3 : 0) +
    (/anna|petra|katja|seraphina|amala|vicki|helena/i.test(v.name) ? 2 : 0) +
    (v.lang.toLowerCase() === "de-de" ? 1 : 0);
  return voices.sort((a, b) => score(b) - score(a))[0];
}

/**
 * Speaks text as it streams in, one sentence at a time, so the voice starts
 * before the whole answer is there (and avoids Chrome cutting long utterances).
 */
export class StreamingSpeaker {
  private buffer = "";
  private pending = 0;
  private finished = false;
  private stopped = false;
  private voice: SpeechSynthesisVoice | null = null;

  constructor(
    private onIdle: () => void,
    private onStart?: () => void,
  ) {
    if (canSpeak()) {
      window.speechSynthesis.cancel();
      this.voice = pickVoice();
    }
  }

  push(text: string) {
    this.buffer += text;
    const re = /^([\s\S]*?[.!?…:;])(\s+)/;
    let m: RegExpMatchArray | null;
    while ((m = this.buffer.match(re)) && m[1].trim().length > 1) {
      this.say(m[1]);
      this.buffer = this.buffer.slice(m[0].length);
    }
  }

  end() {
    if (this.buffer.trim()) this.say(this.buffer);
    this.buffer = "";
    this.finished = true;
    this.checkIdle();
  }

  stop() {
    this.stopped = true;
    this.buffer = "";
    if (canSpeak()) window.speechSynthesis.cancel();
  }

  private say(raw: string) {
    const text = toSpeech(raw);
    if (!text || this.stopped || !canSpeak()) return;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? "de-DE";
    u.rate = 1.02;
    u.pitch = 0.95;
    u.onstart = () => this.onStart?.();
    u.onend = u.onerror = () => {
      this.pending--;
      this.checkIdle();
    };
    this.pending++;
    window.speechSynthesis.speak(u);
  }

  private checkIdle() {
    if (!this.stopped && this.finished && this.pending <= 0) this.onIdle();
  }
}

/** Voices load asynchronously in Chrome; call once early so they're ready later. */
export function warmUpVoices() {
  if (canSpeak()) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }
}

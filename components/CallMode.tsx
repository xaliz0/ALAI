"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toSpeech } from "@/lib/client";
import { StreamingSpeaker, canListen, listen } from "@/lib/speech";
import * as I from "./Icons";

type Phase = "listening" | "thinking" | "speaking" | "muted";

interface Props {
  /** Sends what the user said and streams the reply text through onDelta. */
  ask: (text: string, onDelta: (t: string) => void, signal: AbortSignal) => Promise<void>;
  onClose: () => void;
}

const LABEL: Record<Phase, string> = {
  listening: "Ich hör dir zu …",
  thinking: "Moment, ich überleg …",
  speaking: "Tippen zum Unterbrechen",
  muted: "Stummgeschaltet",
};

export default function CallMode({ ask, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("listening");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<string | null>(canListen() ? null : "unsupported");

  const phaseRef = useRef<Phase>("listening");
  const stopListening = useRef<() => void>(() => {});
  const speaker = useRef<StreamingSpeaker | null>(null);
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const respondRef = useRef<(text: string) => void>(() => {});

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const startListening = useCallback(() => {
    if (!alive.current || phaseRef.current === "muted") return;
    go("listening");
    setHeard("");
    stopListening.current = listen({
      onInterim: setHeard,
      onFinal: (text) => respondRef.current(text),
      onError: (e) => {
        if (e === "not-allowed" || e === "service-not-allowed") setProblem("mic");
      },
      onEnd: () => {
        // Silence timed out without a final result: keep the line open.
        if (alive.current && phaseRef.current === "listening") setTimeout(startListening, 250);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const respond = async (text: string) => {
    go("thinking");
    setHeard(text);
    setReply("");
    const ctrl = new AbortController();
    abort.current = ctrl;
    const s = new StreamingSpeaker(
      () => alive.current && phaseRef.current === "speaking" && startListening(),
      () => phaseRef.current === "thinking" && go("speaking"),
    );
    speaker.current = s;
    let full = "";
    try {
      await ask(
        text,
        (delta) => {
          full += delta;
          setReply(full);
          s.push(delta);
        },
        ctrl.signal,
      );
      if (!full.trim()) s.push("Hm, da kam nichts an. Sag's nochmal?");
    } catch {
      if (ctrl.signal.aborted) return;
      s.push("Sorry, die Verbindung hat gerade gehakt. Versuch's nochmal.");
    }
    if (phaseRef.current === "thinking") go("speaking");
    s.end();
  };

  respondRef.current = respond;

  const interrupt = () => {
    if (phaseRef.current !== "speaking" && phaseRef.current !== "thinking") return;
    abort.current?.abort();
    speaker.current?.stop();
    startListening();
  };

  const toggleMute = () => {
    if (phaseRef.current === "muted") {
      phaseRef.current = "listening";
      startListening();
    } else {
      abort.current?.abort();
      speaker.current?.stop();
      go("muted");
      stopListening.current();
    }
  };

  const hangUp = () => {
    alive.current = false;
    abort.current?.abort();
    speaker.current?.stop();
    stopListening.current();
    onClose();
  };

  useEffect(() => {
    alive.current = true;
    if (canListen()) startListening();
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      alive.current = false;
      clearInterval(t);
      abort.current?.abort();
      speaker.current?.stop();
      stopListening.current();
    };
  }, [startListening]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="call" role="dialog" aria-label="Sprachanruf mit ALAI">
      <div className="call-top">
        <span className="live-dot" /> ALAI · {mm}:{ss}
      </div>

      <button className={`orb-wrap ${phase}`} onClick={interrupt} aria-label="Unterbrechen">
        <div className="orb big">
          <span />
        </div>
        <div className="ring r1" />
        <div className="ring r2" />
      </button>

      <div className="call-text">
        {problem === "unsupported" ? (
          <p className="call-status">
            Dein Browser kann leider keine Spracherkennung. Nimm Chrome, Edge oder Safari, dann klappt&apos;s 🎙️
          </p>
        ) : problem === "mic" ? (
          <p className="call-status">Ich brauch Zugriff aufs Mikro. Erlaub das kurz in den Browser-Einstellungen.</p>
        ) : (
          <>
            <p className="call-status">{LABEL[phase]}</p>
            {phase === "listening" && heard && <p className="call-heard">„{heard}“</p>}
            {(phase === "speaking" || phase === "thinking") && reply && <p className="call-reply">{toSpeech(reply)}</p>}
          </>
        )}
      </div>

      <div className="call-controls">
        <button className={`round ${phase === "muted" ? "on" : ""}`} onClick={toggleMute} aria-label="Stummschalten">
          {phase === "muted" ? <I.MicOff /> : <I.Mic />}
        </button>
        <button className="round hang" onClick={hangUp} aria-label="Auflegen">
          <I.Hangup width={26} height={26} />
        </button>
      </div>
    </div>
  );
}

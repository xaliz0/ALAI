"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { attachmentBlob, download, splitFiles, toSpeech } from "@/lib/client";
import { StreamingSpeaker, canSpeak } from "@/lib/speech";
import type { Attachment, ChatMessage } from "@/lib/types";
import * as I from "./Icons";
import Logo from "./Logo";

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  const blob = () => attachmentBlob(a);
  const save = () => {
    const b = blob();
    if (b) download(a.name, b);
  };
  return (
    <div className="chip">
      {a.kind === "image" && a.data ? (
        <img src={`data:${a.mime};base64,${a.data}`} alt={a.name} />
      ) : (
        <span className="chip-icon">
          <I.FileIcon width={18} height={18} />
          <small>{a.kind === "pdf" ? "PDF" : "TXT"}</small>
        </span>
      )}
      <span className="chip-text">
        <b title={a.name}>{a.name}</b>
        <small>{formatSize(a.size)}</small>
      </span>
      {onRemove ? (
        <button className="icon-btn tiny" onClick={onRemove} aria-label="Anhang entfernen">
          <I.Close width={14} height={14} />
        </button>
      ) : a.data ? (
        <button className="icon-btn tiny" onClick={save} aria-label="Herunterladen">
          <I.Download width={14} height={14} />
        </button>
      ) : null}
    </div>
  );
}

function FileCard({ name, content, complete }: { name: string; content: string; complete: boolean }) {
  const lines = content.split("\n").length;
  return (
    <div className={`file-card ${complete ? "" : "writing"}`}>
      <div className="file-card-icon">
        <I.FileIcon />
      </div>
      <div className="file-card-text">
        <b>{name}</b>
        <small>{complete ? `${lines} Zeilen · ${formatSize(new Blob([content]).size)}` : "wird geschrieben …"}</small>
      </div>
      <button className="btn-soft" disabled={!complete} onClick={() => download(name, content)}>
        <I.Download width={16} height={16} /> Laden
      </button>
    </div>
  );
}

interface Props {
  m: ChatMessage;
  streaming?: boolean;
  status?: string;
  onOpenBrain?: () => void;
}

function MessageView({ m, streaming, status, onOpenBrain }: Props) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState<StreamingSpeaker | null>(null);

  if (m.role === "user") {
    return (
      <div className="msg user">
        {!!m.attachments?.length && (
          <div className="msg-attachments">
            {m.attachments.map((a) => (
              <AttachmentChip key={a.id} a={a} />
            ))}
          </div>
        )}
        {m.text && <div className="bubble">{m.text}</div>}
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(m.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const readAloud = () => {
    if (speaking) {
      speaking.stop();
      setSpeaking(null);
      return;
    }
    const s = new StreamingSpeaker(() => setSpeaking(null));
    s.push(toSpeech(m.text) + " ");
    s.end();
    setSpeaking(s);
  };

  return (
    <div className={`msg ai ${m.error ? "error" : ""}`}>
      <div className="avatar" aria-hidden>
        <Logo size={30} animated={false} />
      </div>
      <div className="ai-body">
        {!m.text && streaming ? (
          <div className="typing">
            {status ? (
              <span className="status">
                <I.Globe width={14} height={14} /> {status}
              </span>
            ) : (
              <>
                <i />
                <i />
                <i />
              </>
            )}
          </div>
        ) : (
          splitFiles(m.text).map((seg, i) =>
            seg.type === "md" ? (
              <div className="md" key={i}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
                  {seg.text}
                </ReactMarkdown>
              </div>
            ) : (
              <FileCard key={i} {...seg} />
            ),
          )
        )}
        {!!m.memoryNotes?.length && (
          <div className="mem-notes">
            {m.memoryNotes.map((n, i) => (
              <button key={i} className="mem-note" onClick={onOpenBrain}>
                <I.BrainIcon width={14} height={14} /> {n}
              </button>
            ))}
          </div>
        )}
        {!streaming && m.text && !m.error && (
          <div className="msg-actions">
            <button className="icon-btn tiny" onClick={copy} aria-label="Kopieren">
              {copied ? <I.Check width={15} height={15} /> : <I.Copy width={15} height={15} />}
            </button>
            {canSpeak() && (
              <button className={`icon-btn tiny ${speaking ? "active" : ""}`} onClick={readAloud} aria-label="Vorlesen">
                <I.Speaker width={15} height={15} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageView);

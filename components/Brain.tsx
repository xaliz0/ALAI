"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { download, uid } from "@/lib/client";
import { MEMORY_CATEGORIES, type Memory, type MemoryCategory, type Profile } from "@/lib/types";
import { CATEGORY_COLOR } from "./BrainHolo";
import * as I from "./Icons";

const BrainHolo = dynamic(() => import("./BrainHolo"), { ssr: false });

export const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  fakt: "Fakten",
  ereignis: "Ereignisse",
  vorliebe: "Vorlieben",
  person: "Personen",
  ziel: "Ziele",
};

interface Props {
  profile: Profile;
  memories: Memory[];
  onAdd: (m: Memory) => void;
  onDelete: (id: string) => void;
  onEnableMemory: () => void;
  onClose: () => void;
}

export default function Brain({ profile, memories, onAdd, onDelete, onEnableMemory, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<MemoryCategory | "alle">("alle");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [draftCat, setDraftCat] = useState<MemoryCategory>("fakt");

  const counts = useMemo(() => {
    const c = Object.fromEntries(MEMORY_CATEGORIES.map((k) => [k, 0])) as Record<MemoryCategory, number>;
    memories.forEach((m) => c[m.category]++);
    return c;
  }, [memories]);

  const shown = memories
    .filter((m) => filter === "alle" || m.category === filter)
    .filter((m) => !query || m.text.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);

  const visibleInHolo = filter === "alle" ? memories : memories.filter((m) => m.category === filter);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd({ id: uid().slice(0, 8), text: draft.trim(), category: draftCat, createdAt: Date.now() });
    setDraft("");
  };

  return (
    <div className="brain" role="dialog" aria-label="Gehirn von ALAI">
      <header className="brain-head">
        <div>
          <span className="hud-label">NEURAL CORE // {profile.name.toUpperCase()}</span>
          <h2>Gehirn</h2>
        </div>
        <div className="brain-stats">
          <div>
            <b>{memories.length}</b>
            <span>Memories</span>
          </div>
          <div>
            <b>{profile.consent ? "ON" : "OFF"}</b>
            <span>Datenbank</span>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Schließen">
          <I.Close />
        </button>
      </header>

      <div className="brain-body">
        <div className="brain-stage">
          <BrainHolo memories={visibleInHolo} selectedId={selected} onSelect={setSelected} />
          <div className="hud-corners" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="legend">
            {MEMORY_CATEGORIES.map((c) => (
              <span key={c}>
                <i style={{ background: CATEGORY_COLOR[c] }} /> {CATEGORY_LABEL[c]} · {counts[c]}
              </span>
            ))}
          </div>
          {!memories.length && (
            <div className="holo-empty">
              {profile.consent ? (
                <p>Noch leer hier. Erzähl ALAI was über dich und schau zu, wie das Gehirn wächst ✨</p>
              ) : (
                <>
                  <p>Das Gedächtnis ist für dieses Profil aus.</p>
                  <button className="btn-primary" onClick={onEnableMemory}>
                    Datenbank aktivieren
                  </button>
                </>
              )}
            </div>
          )}
          <p className="holo-help">Ziehen zum Drehen · Scrollen zum Zoomen · Knoten antippen</p>
        </div>

        <aside className="brain-panel">
          <div className="filters">
            {(["alle", ...MEMORY_CATEGORIES] as const).map((c) => (
              <button
                key={c}
                className={filter === c ? "on" : ""}
                onClick={() => setFilter(c)}
                style={c !== "alle" ? ({ "--c": CATEGORY_COLOR[c] } as React.CSSProperties) : undefined}
              >
                {c === "alle" ? "Alle" : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <input className="search" placeholder="Im Gehirn suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />

          <div className="mem-list">
            {shown.map((m) => (
              <div
                key={m.id}
                className={`mem ${selected === m.id ? "sel" : ""}`}
                style={{ "--c": CATEGORY_COLOR[m.category] } as React.CSSProperties}
                onClick={() => setSelected(selected === m.id ? null : m.id)}
              >
                <div className="mem-top">
                  <span className="mem-cat">{CATEGORY_LABEL[m.category]}</span>
                  <span className="mem-date">
                    {m.date ? new Date(m.date).toLocaleDateString("de-DE") : new Date(m.createdAt).toLocaleDateString("de-DE")}
                  </span>
                  <button
                    className="icon-btn tiny"
                    aria-label="Vergessen"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(m.id);
                    }}
                  >
                    <I.Trash width={14} height={14} />
                  </button>
                </div>
                <p>{m.text}</p>
              </div>
            ))}
            {!!memories.length && !shown.length && <p className="muted">Nix gefunden.</p>}
          </div>

          {profile.consent && (
            <form className="mem-add" onSubmit={add}>
              <select value={draftCat} onChange={(e) => setDraftCat(e.target.value as MemoryCategory)}>
                {MEMORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
              <input placeholder="Selbst was eintragen …" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="send" type="submit" disabled={!draft.trim()} aria-label="Hinzufügen">
                <I.Plus />
              </button>
            </form>
          )}
          {!!memories.length && (
            <button
              className="btn-soft export"
              onClick={() =>
                download(`alai-gehirn-${profile.name}.json`, JSON.stringify(memories, null, 2), "application/json")
              }
            >
              <I.Download width={16} height={16} /> Gehirn exportieren
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

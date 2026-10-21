"use client";

import { useState } from "react";
import type { Profile } from "@/lib/types";
import * as I from "./Icons";
import Logo from "./Logo";

export function Avatar({ p, size = 32 }: { p: Profile; size?: number }) {
  return (
    <span
      className="avatar-letter"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, hsl(${p.hue} 90% 62%), hsl(${(p.hue + 60) % 360} 85% 55%))`,
      }}
    >
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** First screen: name the profile. */
export function CreateProfile({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  return (
    <div className="modal-bg">
      <form
        className="modal onboarding"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
      >
        <Logo size={64} />
        <span className="hud-label">NEUES PROFIL</span>
        <h3>Wie soll ich dich nennen?</h3>
        <input autoFocus maxLength={30} placeholder="Dein Name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" type="submit" disabled={!name.trim()}>
          Weiter
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </form>
    </div>
  );
}

/** Asks before a profile's database is created. Nothing is stored until "Akzeptieren". */
export function ConsentDialog({ profile, onAnswer }: { profile: Profile; onAnswer: (ok: boolean) => void }) {
  return (
    <div className="modal-bg">
      <div className="modal consent">
        <div className="consent-icon">
          <I.Shield width={26} height={26} />
        </div>
        <span className="hud-label">DATENBANK // {profile.name.toUpperCase()}</span>
        <h3>Darf ich mir Sachen merken?</h3>
        <p>Für dein Profil würde ich eine eigene Datenbank anlegen. Darin landen:</p>
        <ul>
          <li>deine Chats</li>
          <li>Memories: wichtige Infos und Ereignisse, die du mir erzählst</li>
        </ul>
        <p>
          Alles bleibt <b>nur auf diesem Gerät</b>. Du kannst jederzeit im „Gehirn“ reinschauen, einzelne Sachen löschen
          oder die ganze Datenbank killen.
        </p>
        <button className="btn-primary" onClick={() => onAnswer(true)}>
          Akzeptieren
        </button>
        <button className="btn-ghost" onClick={() => onAnswer(false)}>
          Ohne Gedächtnis weiter
        </button>
      </div>
    </div>
  );
}

interface MenuProps {
  profiles: Profile[];
  active: Profile;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onToggleMemory: () => void;
  onDelete: () => void;
}

export function ProfileMenu({ profiles, active, onSwitch, onNew, onToggleMemory, onDelete }: MenuProps) {
  const [open, setOpen] = useState(false);
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="profile-menu">
      {open && (
        <div className="profile-pop">
          {profiles.map((p) => (
            <button key={p.id} className={`pop-item ${p.id === active.id ? "on" : ""}`} onClick={act(() => onSwitch(p.id))}>
              <Avatar p={p} size={24} /> {p.name}
              {p.id === active.id && <I.Check width={16} height={16} />}
            </button>
          ))}
          <button className="pop-item" onClick={act(onNew)}>
            <I.Plus width={18} height={18} /> Neues Profil
          </button>
          <hr />
          <button className="pop-item" onClick={act(onToggleMemory)}>
            <I.BrainIcon width={18} height={18} /> Gedächtnis {active.consent ? "ausschalten" : "einschalten"}
          </button>
          <button className="pop-item danger" onClick={act(onDelete)}>
            <I.Trash width={18} height={18} /> Profil löschen
          </button>
        </div>
      )}
      <button className="profile-btn" onClick={() => setOpen((o) => !o)}>
        <Avatar p={active} />
        <span>
          <b>{active.name}</b>
          <small>{active.consent ? "Gedächtnis an" : "Gedächtnis aus"}</small>
        </span>
        <I.Chevron width={16} height={16} />
      </button>
    </div>
  );
}

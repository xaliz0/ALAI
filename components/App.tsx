"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AccessError, fileToAttachment, setAccessCode, streamChat, uid } from "@/lib/client";
import * as db from "@/lib/db";
import { canListen, listen, warmUpVoices } from "@/lib/speech";
import type { Attachment, Chat, ChatMessage, Memory, Profile } from "@/lib/types";
import Brain from "./Brain";
import CallMode from "./CallMode";
import * as I from "./Icons";
import Logo from "./Logo";
import Message, { AttachmentChip } from "./Message";
import { ConsentDialog, CreateProfile, ProfileMenu } from "./Profiles";

const SUGGESTIONS = [
  { title: "Erklär mir was", text: "Erklär mir, wie KI eigentlich funktioniert – so, dass ich's checke." },
  { title: "Merk dir was", text: "Merk dir: Ich hab nächsten Freitag eine wichtige Prüfung." },
  { title: "Datei bauen", text: "Mach mir einen Lernplan für die nächste Woche als Markdown-Datei." },
  { title: "Was geht ab?", text: "Was sind gerade die wichtigsten News? Kurz und knackig." },
];

const newChat = (): Chat => ({ id: uid(), title: "Neuer Chat", messages: [], updatedAt: Date.now() });

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [chats, setChats] = useState<Chat[]>([newChat()]);
  const [activeId, setActiveId] = useState<string>("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState("");
  const [dragging, setDragging] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [calling, setCalling] = useState(false);
  const [brainOpen, setBrainOpen] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [askCode, setAskCode] = useState(false);
  const [ready, setReady] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const stopDictation = useRef<() => void>(() => {});
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const profile = profiles.find((p) => p.id === profileId);
  const hasDb = profile?.consent === true;

  // The call screen keeps one long-lived callback, so read live state via refs.
  const live = useRef({ chats, activeId, memories, profile, hasDb });
  live.current = { chats, activeId, memories, profile, hasDb };

  // --- profiles & database -------------------------------------------------

  useEffect(() => {
    const ps = db.loadProfiles();
    setProfiles(ps);
    const saved = db.loadActiveProfileId();
    setProfileId(ps.find((p) => p.id === saved)?.id ?? ps[0]?.id ?? "");
    setReady(true);
    warmUpVoices();
  }, []);

  const updateProfiles = (fn: (ps: Profile[]) => Profile[]) =>
    setProfiles((ps) => {
      const next = fn(ps);
      db.saveProfiles(next);
      return next;
    });

  // Load the active profile's data whenever the profile or its consent changes.
  useEffect(() => {
    if (!profileId) return;
    db.saveActiveProfileId(profileId);
    let cancelled = false;
    const fresh = newChat();
    if (!hasDb) {
      setChats([fresh]);
      setActiveId(fresh.id);
      setMemories([]);
      return;
    }
    Promise.all([db.getAll<Chat>(profileId, "chats"), db.getAll<Memory>(profileId, "memories")])
      .then(([cs, ms]) => {
        if (cancelled) return;
        const sorted = cs.sort((a, b) => b.updatedAt - a.updatedAt);
        setChats([fresh, ...sorted]);
        setActiveId(fresh.id);
        setMemories(ms);
      })
      .catch(() => flash("Datenbank konnte nicht geladen werden."));
    return () => {
      cancelled = true;
    };
  }, [profileId, hasDb]);

  // Persist chats that have content (debounced while streaming).
  const dirty = useRef(new Set<string>());
  useEffect(() => {
    if (!hasDb || !dirty.current.size) return;
    const t = setTimeout(() => {
      for (const id of dirty.current) {
        const c = chats.find((x) => x.id === id);
        if (c?.messages.length) db.put(profileId, "chats", c).catch(() => {});
      }
      dirty.current.clear();
    }, 500);
    return () => clearTimeout(t);
  }, [chats, hasDb, profileId]);

  const createProfile = (name: string) => {
    const p: Profile = { id: uid(), name, hue: Math.floor(Math.random() * 360), createdAt: Date.now(), consent: null };
    updateProfiles((ps) => [...ps, p]);
    setProfileId(p.id);
    setCreatingProfile(false);
  };

  const answerConsent = (ok: boolean) => {
    updateProfiles((ps) => ps.map((p) => (p.id === profileId ? { ...p, consent: ok, consentAt: Date.now() } : p)));
    flash(ok ? "Datenbank ist am Start 🧠" : "Alles klar, ich merk mir nix.");
  };

  const toggleMemory = async () => {
    if (!profile) return;
    if (!profile.consent) {
      updateProfiles((ps) => ps.map((p) => (p.id === profileId ? { ...p, consent: null } : p)));
      return;
    }
    if (!confirm(`Gedächtnis für ${profile.name} ausschalten? Die Datenbank mit allen Chats und Memories wird gelöscht.`)) return;
    await db.deleteProfileDb(profileId);
    updateProfiles((ps) => ps.map((p) => (p.id === profileId ? { ...p, consent: false } : p)));
    flash("Datenbank gelöscht.");
  };

  const deleteProfile = async () => {
    if (!profile || !confirm(`Profil ${profile.name} komplett löschen?`)) return;
    await db.deleteProfileDb(profileId);
    const rest = profiles.filter((p) => p.id !== profileId);
    updateProfiles(() => rest);
    setProfileId(rest[0]?.id ?? "");
  };

  // --- memories ------------------------------------------------------------

  const addMemory = useCallback((m: Memory) => {
    const { profile: p, hasDb: ok } = live.current;
    if (!p || !ok) return;
    setMemories((ms) => [...ms.filter((x) => x.id !== m.id), m]);
    db.put(p.id, "memories", m).catch(() => {});
  }, []);

  const forgetMemory = useCallback((id: string) => {
    const { profile: p } = live.current;
    if (!p) return;
    setMemories((ms) => ms.filter((x) => x.id !== id));
    db.remove(p.id, "memories", id).catch(() => {});
  }, []);

  // --- chat ----------------------------------------------------------------

  const active = chats.find((c) => c.id === activeId);
  const messages = active?.messages ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const patchChat = (id: string, fn: (c: Chat) => Chat) => {
    dirty.current.add(id);
    setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  };

  /**
   * Adds the user's message, streams the reply into a new assistant message,
   * and reports every text delta to onDelta (used by the call screen).
   */
  const runTurn = useCallback(
    async (
      text: string,
      attachments: Attachment[],
      mode: "chat" | "call",
      onDelta?: (t: string) => void,
      signal?: AbortSignal,
    ) => {
      const { chats: cs, activeId: chatId, memories: mems, profile: p, hasDb: ok } = live.current;
      const chat = cs.find((c) => c.id === chatId);
      if (!chat) return;
      const userMsg: ChatMessage = { id: uid(), role: "user", text, attachments, createdAt: Date.now() };
      const aiMsg: ChatMessage = { id: uid(), role: "assistant", text: "", createdAt: Date.now() };
      const history = [...chat.messages.filter((m) => !m.error), userMsg];
      const title = chat.messages.length ? chat.title : (text || attachments[0]?.name || "Neuer Chat").slice(0, 42);
      // Mirror into the ref right away so a quick follow-up (call mode) sees this turn.
      live.current.chats = cs.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, userMsg] } : c));

      patchChat(chatId, (c) => ({ ...c, title, messages: [...c.messages, userMsg, aiMsg], updatedAt: Date.now() }));
      stickToBottom.current = true;

      const setAi = (fn: (m: ChatMessage) => ChatMessage) =>
        patchChat(chatId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === aiMsg.id ? fn(m) : m)) }));
      const note = (n: string) => setAi((m) => ({ ...m, memoryNotes: [...(m.memoryNotes ?? []), n] }));

      setBusy(true);
      setStatus("");
      try {
        await streamChat(
          history,
          mode,
          (e) => {
            if (e.t === "text") {
              setStatus("");
              onDelta?.(e.v);
              setAi((m) => ({ ...m, text: m.text + e.v }));
            } else if (e.t === "status") {
              setStatus(e.v);
            } else if (e.t === "memory_add") {
              addMemory(e.memory);
              note(`Gemerkt: ${e.memory.text}`);
            } else if (e.t === "memory_forget") {
              const old = live.current.memories.find((m) => m.id === e.id);
              forgetMemory(e.id);
              note(`Vergessen: ${old?.text ?? e.id}`);
            } else if (e.t === "error") {
              setAi((m) => ({ ...m, text: (m.text ? m.text + "\n\n" : "") + `⚠️ ${e.v}`, error: !m.text }));
            }
          },
          signal,
          {
            profileName: p?.name,
            memories: ok ? mems.map(({ id, text, category, date }) => ({ id, text, category, date })) : undefined,
          },
        );
      } catch (err) {
        if (signal?.aborted) {
          setAi((m) => ({ ...m, text: m.text || "_(abgebrochen)_" }));
        } else {
          if (err instanceof AccessError) setAskCode(true);
          setAi((m) => ({ ...m, error: true, text: `⚠️ ${(err as Error).message || "Verbindung weg."}` }));
          if (mode === "call") throw err;
        }
      } finally {
        setBusy(false);
        setStatus("");
      }
    },
    [addMemory, forgetMemory],
  );

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if ((!text && !pending.length) || busy) return;
    stopDictation.current();
    const atts = pending;
    setInput("");
    setPending([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await runTurn(text, atts, "chat", undefined, ctrl.signal);
    textRef.current?.focus();
  };

  const addFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try {
        const a = await fileToAttachment(f);
        setPending((p) => [...p, a]);
      } catch (e) {
        flash((e as Error).message);
      }
    }
  };

  const toggleDictation = () => {
    if (dictating) {
      stopDictation.current();
      return;
    }
    if (!canListen()) return flash("Dein Browser kann leider keine Spracheingabe. Probier Chrome, Edge oder Safari.");
    const before = input ? input.trimEnd() + " " : "";
    setDictating(true);
    stopDictation.current = listen({
      continuous: true,
      onInterim: (t) => setInput(before + t),
      onFinal: (t) => setInput(before + t),
      onError: (e) => e === "not-allowed" && flash("Mikro ist blockiert. Erlaub es in den Browser-Einstellungen."),
      onEnd: () => setDictating(false),
    });
  };

  const startCall = () => {
    if (busy) abortRef.current?.abort();
    setCalling(true);
  };

  const removeChat = (id: string) => {
    if (hasDb) db.remove(profileId, "chats", id).catch(() => {});
    setChats((cs) => {
      const rest = cs.filter((c) => c.id !== id);
      const next = rest.length ? rest : [newChat()];
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  const openNewChat = () => {
    const empty = chats.find((c) => !c.messages.length);
    if (empty) setActiveId(empty.id);
    else {
      const c = newChat();
      setChats((cs) => [c, ...cs]);
      setActiveId(c.id);
    }
    setSidebar(false);
    setTimeout(() => textRef.current?.focus(), 50);
  };

  // Auto-grow the composer.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const last = messages[messages.length - 1];
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      <div className="bg" aria-hidden>
        <div className="grid" />
        <div className="blob b1" />
        <div className="blob b2" />
      </div>

      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="brand">
          <Logo size={34} />
          <div>
            <b>ALAI</b>
            <span className="hud-label">v1.0 // ONLINE</span>
          </div>
        </div>
        <button className="new-chat" onClick={openNewChat}>
          <I.Plus width={18} height={18} /> Neuer Chat
        </button>
        <nav className="chat-list">
          {sortedChats
            .filter((c) => c.messages.length || c.id === activeId)
            .map((c) => (
              <div
                key={c.id}
                className={`chat-item ${c.id === activeId ? "active" : ""}`}
                onClick={() => {
                  setActiveId(c.id);
                  setSidebar(false);
                }}
              >
                <span>{c.title}</span>
                {!!c.messages.length && (
                  <button
                    className="icon-btn tiny"
                    aria-label="Chat löschen"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeChat(c.id);
                    }}
                  >
                    <I.Trash width={14} height={14} />
                  </button>
                )}
              </div>
            ))}
        </nav>
        {profile && (
          <ProfileMenu
            profiles={profiles}
            active={profile}
            onSwitch={(id) => {
              setProfileId(id);
              setSidebar(false);
            }}
            onNew={() => setCreatingProfile(true)}
            onToggleMemory={toggleMemory}
            onDelete={deleteProfile}
          />
        )}
      </aside>
      {sidebar && <div className="scrim" onClick={() => setSidebar(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setSidebar(true)} aria-label="Menü">
            <I.Menu />
          </button>
          <div className="topbar-title">
            <b>{active?.messages.length ? active.title : "ALAI"}</b>
            <small>
              <span className="live-dot" /> online{hasDb ? ` · ${memories.length} Memories` : ""}
            </small>
          </div>
          <button className="pill" onClick={() => setBrainOpen(true)} aria-label="Gehirn öffnen">
            <I.BrainIcon width={18} height={18} /> <span>Gehirn</span>
          </button>
          <button className="pill primary" onClick={startCall} aria-label="Anrufen">
            <I.Phone width={18} height={18} /> <span>Anrufen</span>
          </button>
        </header>

        <div
          className="messages"
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {ready && !messages.length ? (
            <div className="hero">
              <div className="hero-logo">
                <Logo size={110} />
                <div className="hero-ring" />
                <div className="hero-ring r2" />
              </div>
              <h1>
                {profile ? `Yo ${profile.name}, ` : "Yo, "}ich bin <span className="grad">ALAI</span>.
              </h1>
              <p>Schreib mir, ruf mich an oder schick mir Bilder, PDFs und Dateien.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s.title} onClick={() => send(s.text)}>
                    <b>{s.title}</b>
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="thread">
              {messages.map((m) => (
                <Message
                  key={m.id}
                  m={m}
                  streaming={busy && m.id === last?.id}
                  status={busy && m.id === last?.id ? status : undefined}
                  onOpenBrain={() => setBrainOpen(true)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="composer-wrap">
          <div className={`composer ${dictating ? "dictating" : ""}`}>
            {!!pending.length && (
              <div className="pending">
                {pending.map((a) => (
                  <AttachmentChip key={a.id} a={a} onRemove={() => setPending((p) => p.filter((x) => x.id !== a.id))} />
                ))}
              </div>
            )}
            <div className="composer-row">
              <button className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Datei anhängen">
                <I.Clip />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                accept="image/*,application/pdf,.txt,.md,.csv,.json,.js,.ts,.tsx,.py,.html,.css,.xml,.yml,.yaml,.sql,.java,.c,.cpp,.cs,.go,.rs,.php,.rb,.sh,.log"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <textarea
                ref={textRef}
                rows={1}
                value={input}
                placeholder={dictating ? "Sprich einfach …" : "Schreib was …"}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files);
                  if (files.length) {
                    e.preventDefault();
                    addFiles(files);
                  }
                }}
              />
              <button className={`icon-btn ${dictating ? "rec" : ""}`} onClick={toggleDictation} aria-label="Spracheingabe">
                <I.Mic />
              </button>
              {busy ? (
                <button className="send" onClick={() => abortRef.current?.abort()} aria-label="Stopp">
                  <I.Stop />
                </button>
              ) : (
                <button className="send" disabled={!input.trim() && !pending.length} onClick={() => send()} aria-label="Senden">
                  <I.Send />
                </button>
              )}
            </div>
          </div>
          <p className="hint">ALAI kann sich irren. Check wichtige Infos lieber nochmal.</p>
        </div>
      </main>

      {dragging && (
        <div className="drop">
          <div>
            <I.Clip width={36} height={36} />
            <p>Lass die Datei einfach hier fallen</p>
          </div>
        </div>
      )}

      {calling && (
        <CallMode
          ask={(text, onDelta, signal) => runTurn(text, [], "call", onDelta, signal)}
          onClose={() => setCalling(false)}
        />
      )}

      {brainOpen && profile && (
        <Brain
          profile={profile}
          memories={memories}
          onAdd={addMemory}
          onDelete={forgetMemory}
          onEnableMemory={toggleMemory}
          onClose={() => setBrainOpen(false)}
        />
      )}

      {ready && (!profiles.length || creatingProfile) && (
        <CreateProfile onCreate={createProfile} onCancel={profiles.length ? () => setCreatingProfile(false) : undefined} />
      )}
      {profile && profile.consent === null && !creatingProfile && <ConsentDialog profile={profile} onAnswer={answerConsent} />}

      {askCode && (
        <div className="modal-bg">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              const code = new FormData(e.currentTarget).get("code") as string;
              setAccessCode(code.trim());
              setAskCode(false);
              flash("Code gespeichert. Schick deine Nachricht nochmal.");
            }}
          >
            <span className="hud-label">ZUGANG</span>
            <h3>Zugangscode</h3>
            <p>Diese ALAI ist privat. Gib den Code ein, den du bekommen hast.</p>
            <input name="code" type="password" autoFocus placeholder="Code" />
            <button className="btn-primary" type="submit">
              Los geht&apos;s
            </button>
          </form>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

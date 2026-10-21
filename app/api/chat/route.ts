import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { contextPrompt, systemPrompt } from "@/lib/prompt";
import { MEMORY_CATEGORIES, type ChatRequest, type Memory, type MemoryCategory, type StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "claude-opus-5-5";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const client = new Anthropic();

const WEB_SEARCH: BetaToolUnion = { type: "web_search_20260209", name: "web_search", max_uses: 3 };

const MEMORY_TOOLS: BetaToolUnion[] = [
  {
    name: "remember",
    description:
      "Speichert eine Erinnerung dauerhaft im Gedächtnis dieses Profils. Für Fakten über den Nutzer, Vorlieben, Ziele, wichtige Personen und Ereignisse.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Die Erinnerung als kurzer, eigenständiger Satz in der dritten Person." },
        category: { type: "string", enum: [...MEMORY_CATEGORIES] },
        date: {
          type: "string",
          description: "Datum des Ereignisses als YYYY-MM-DD, oder leerer String wenn unbekannt/unpassend.",
        },
      },
      required: ["text", "category", "date"],
      additionalProperties: false,
    },
  },
  {
    name: "forget",
    description: "Löscht eine Erinnerung aus dem Gedächtnis, über ihre ID in eckigen Klammern.",
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

/** Runs a memory tool call; the actual storage happens in the browser's profile database. */
function runMemoryTool(
  name: string,
  input: unknown,
  known: Set<string>,
  send: (e: StreamEvent) => void,
): { content: string; is_error?: boolean } {
  const i = (input ?? {}) as Record<string, unknown>;
  if (name === "remember") {
    const text = typeof i.text === "string" ? i.text.trim() : "";
    const category = MEMORY_CATEGORIES.includes(i.category as MemoryCategory) ? (i.category as MemoryCategory) : null;
    if (!text || !category) return { content: "INVALID_INPUT: text und category sind Pflicht.", is_error: true };
    const date = typeof i.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.date) ? i.date : undefined;
    const memory: Memory = { id: crypto.randomUUID().slice(0, 8), text, category, date, createdAt: Date.now() };
    known.add(memory.id);
    send({ t: "memory_add", memory });
    return { content: `Gespeichert mit ID ${memory.id}.` };
  }
  if (name === "forget") {
    const id = typeof i.id === "string" ? i.id.replace(/[\[\]]/g, "").trim() : "";
    if (!known.has(id)) return { content: `Keine Erinnerung mit ID ${id}.`, is_error: true };
    known.delete(id);
    send({ t: "memory_forget", id });
    return { content: "Gelöscht." };
  }
  return { content: `Unbekanntes Tool ${name}.`, is_error: true };
}

function toApiMessages(req: ChatRequest): BetaMessageParam[] {
  return req.messages.map((m) => {
    if (m.role === "assistant") {
      return { role: "assistant", content: m.text || "…" };
    }
    const content: BetaContentBlockParam[] = [];
    for (const a of m.attachments ?? []) {
      if (!a.data) {
        // Older attachment whose bytes were dropped to keep the request small
        content.push({ type: "text", text: `[Früher geteilter Anhang: ${a.name}]` });
      } else if (a.kind === "image" && IMAGE_TYPES.includes(a.mime as ImageType)) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: a.mime as ImageType, data: a.data },
        });
      } else if (a.kind === "pdf") {
        content.push({
          type: "document",
          title: a.name,
          source: { type: "base64", media_type: "application/pdf", data: a.data },
        });
      } else {
        content.push({
          type: "document",
          title: a.name,
          source: {
            type: "text",
            media_type: "text/plain",
            data: Buffer.from(a.data, "base64").toString("utf8"),
          },
        });
      }
    }
    content.push({ type: "text", text: m.text || "(Schau dir den Anhang an.)" });
    return { role: "user", content };
  });
}

export async function POST(request: Request) {
  const accessCode = process.env.ALAI_ACCESS_CODE;
  if (accessCode && request.headers.get("x-alai-code") !== accessCode) {
    return Response.json({ error: "Falscher Zugangscode" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Auf dem Server fehlt ANTHROPIC_API_KEY. Trag ihn in den Umgebungsvariablen ein." },
      { status: 500 },
    );
  }

  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Kaputte Anfrage" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Keine Nachrichten" }, { status: 400 });
  }

  const isCall = body.mode === "call";
  const messages = toApiMessages(body);
  const memoryOn = Array.isArray(body.memories);
  const knownIds = new Set((body.memories ?? []).map((m) => m.id));
  const memories = body.memories?.slice(0, 500).map((m) => ({ ...m, text: String(m.text).slice(0, 500) }));
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        // Loop for memory tool calls and for long web searches that pause the turn.
        let wroteText = false;
        for (let round = 0; round < 8; round++) {
          let gap = wroteText;
          const s = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: isCall ? 4000 : 32000,
              system: [
                { type: "text", text: systemPrompt(isCall), cache_control: { type: "ephemeral" } },
                {
                  type: "text",
                  text: contextPrompt({
                    profileName: String(body.profileName ?? "").slice(0, 60),
                    today: body.today,
                    memories,
                  }),
                },
              ],
              messages,
              thinking: { type: "adaptive" },
              output_config: { effort: isCall ? "low" : "medium" },
              tools: memoryOn ? [WEB_SEARCH, ...MEMORY_TOOLS] : [WEB_SEARCH],
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
            },
            { signal: request.signal },
          );

          for await (const event of s) {
            if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
              send({ t: "status", v: "Suche im Internet …" });
            } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ t: "text", v: (gap ? "\n\n" : "") + event.delta.text });
              gap = false;
              wroteText = true;
            }
          }

          const final = await s.finalMessage();
          if (final.stop_reason === "refusal") {
            send({ t: "error", v: "Dazu kann ich leider nichts sagen." });
            break;
          }
          messages.push({ role: "assistant", content: final.content as BetaContentBlockParam[] });
          if (final.stop_reason === "pause_turn") continue;
          if (final.stop_reason !== "tool_use") break;

          const results: BetaToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            const r = runMemoryTool(block.name, block.input, knownIds, send);
            results.push({ type: "tool_result", tool_use_id: block.id, ...r });
          }
          messages.push({ role: "user", content: results });
        }
        send({ t: "done" });
      } catch (err) {
        if (!request.signal.aborted) {
          send({ t: "error", v: describeError(err) });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Der API-Key ist ungültig.";
  if (err instanceof Anthropic.RateLimitError) return "Gerade zu viele Anfragen, probier's gleich nochmal.";
  if (err instanceof Anthropic.BadRequestError) return `Anfrage abgelehnt: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `KI-Server meldet einen Fehler (${err.status ?? "?"}).`;
  return "Verbindung zur KI ist abgebrochen.";
}

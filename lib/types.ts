export type AttachmentKind = "image" | "pdf" | "text";

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  /** base64 without the data: prefix; dropped for old turns to keep requests small */
  data?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments?: Attachment[];
  createdAt: number;
  error?: boolean;
  /** Memories ALAI saved or removed while writing this reply */
  memoryNotes?: string[];
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export const MEMORY_CATEGORIES = ["fakt", "ereignis", "vorliebe", "person", "ziel"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface Memory {
  id: string;
  text: string;
  category: MemoryCategory;
  /** When the remembered thing happened or is due (YYYY-MM-DD), if known */
  date?: string;
  createdAt: number;
}

export interface Profile {
  id: string;
  name: string;
  hue: number;
  createdAt: number;
  /** null = not asked yet, true = database allowed, false = declined */
  consent: boolean | null;
  consentAt?: number;
}

export interface ChatRequest {
  mode: "chat" | "call";
  messages: Pick<ChatMessage, "role" | "text" | "attachments">[];
  profileName?: string;
  /** Only sent when the profile allowed its database; enables the memory tools */
  memories?: Pick<Memory, "id" | "text" | "category" | "date">[];
  today?: string;
}

export type StreamEvent =
  | { t: "text"; v: string }
  | { t: "status"; v: string }
  | { t: "error"; v: string }
  | { t: "memory_add"; memory: Memory }
  | { t: "memory_forget"; id: string }
  | { t: "done" };

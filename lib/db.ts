"use client";

/*
 * Every profile gets its own IndexedDB database ("alai-<profileId>") holding
 * its chats and memories. It is only created after the profile owner agreed.
 */

import type { Chat, Memory, Profile } from "./types";

const PROFILES_KEY = "alai.profiles.v1";
const ACTIVE_KEY = "alai.activeProfile";
const STORES = ["chats", "memories"] as const;
type Store = (typeof STORES)[number];

const dbName = (profileId: string) => `alai-${profileId}`;

// --- profiles (small, so plain localStorage) ------------------------------

export function loadProfiles(): Profile[] {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: Profile[]) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {}
}

export function loadActiveProfileId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveActiveProfileId(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {}
}

// --- per-profile database ---------------------------------------------------

const open = new Map<string, Promise<IDBDatabase>>();

function openDb(profileId: string): Promise<IDBDatabase> {
  let p = open.get(profileId);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName(profileId), 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) {
          if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    open.set(profileId, p);
  }
  return p;
}

function run<T>(profileId: string, store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void) {
  return openDb(profileId).then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export const getAll = <T>(profileId: string, store: Store) =>
  run<T[]>(profileId, store, "readonly", (s) => s.getAll());

export const put = (profileId: string, store: Store, value: Chat | Memory) =>
  run<void>(profileId, store, "readwrite", (s) => void s.put(value));

export const remove = (profileId: string, store: Store, id: string) =>
  run<void>(profileId, store, "readwrite", (s) => void s.delete(id));

/** Wipes the profile's whole database. */
export async function deleteProfileDb(profileId: string) {
  const p = open.get(profileId);
  open.delete(profileId);
  if (p) (await p.catch(() => null))?.close();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(dbName(profileId));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

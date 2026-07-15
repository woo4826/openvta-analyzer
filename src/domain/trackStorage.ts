import type { TrackProfileV1 } from "./types";
import { validateTrackProfile } from "./trackProfile";

const DATABASE_NAME = "openvta-analyzer";
const DATABASE_VERSION = 1;
const STORE_NAME = "track-profiles";
const memoryProfiles = new Map<string, TrackProfileV1>();

export async function listTrackProfiles(): Promise<TrackProfileV1[]> {
  const persisted = await withStore("readonly", (store) => requestResult<TrackProfileV1[]>(store.getAll()), []);
  const combined = new Map<string, TrackProfileV1>();
  for (const profile of persisted) combined.set(profile.id, profile);
  for (const profile of memoryProfiles.values()) combined.set(profile.id, profile);
  return [...combined.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getTrackProfile(id: string): Promise<TrackProfileV1 | undefined> {
  const memory = memoryProfiles.get(id);
  if (memory) return memory;
  return withStore("readonly", (store) => requestResult<TrackProfileV1 | undefined>(store.get(id)), undefined);
}

export async function saveTrackProfile(profile: TrackProfileV1): Promise<void> {
  await saveTrackProfiles([profile]);
}

export async function saveTrackProfiles(profiles: TrackProfileV1[]): Promise<void> {
  const validated: TrackProfileV1[] = [];
  const ids = new Set<string>();
  for (const profile of profiles) {
    const result = validateTrackProfile(profile);
    if (!result.profile) throw new Error(`Invalid track profile: ${result.error ?? profile.id}`);
    if (ids.has(result.profile.id)) throw new Error(`Duplicate track profile id: ${result.profile.id}`);
    ids.add(result.profile.id);
    validated.push(result.profile);
  }
  for (const profile of validated) memoryProfiles.set(profile.id, profile);
  await withStore("readwrite", async (store) => {
    await Promise.all(validated.map((profile) => requestResult(store.put(profile))));
  }, undefined);
}

export async function deleteTrackProfile(id: string): Promise<void> {
  memoryProfiles.delete(id);
  await withStore("readwrite", async (store) => {
    await requestResult(store.delete(id));
  }, undefined);
}

export function clearTrackProfileMemoryForTests(): void {
  memoryProfiles.clear();
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
  fallback: T,
): Promise<T> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    if (!db) return fallback;
    return await operation(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
  } catch {
    return fallback;
  } finally {
    db?.close();
  }
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  let factory: IDBFactory | undefined;
  try {
    factory = globalThis.indexedDB;
  } catch {
    return Promise.resolve(undefined);
  }
  if (!factory) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Track profile storage is blocked."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

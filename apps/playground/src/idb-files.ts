import { createBinaryFile, type BinaryFile } from "@oh-just-another/scene";
import { fileId as castFileId, type FileId } from "@oh-just-another/types";

/**
 * Browser-local store for the autosaved scene: its binary assets (image /
 * GIF bytes) keyed by `fileId` in one object store, the scene JSON in
 * another. IndexedDB holds `ArrayBuffer`s natively through structured
 * clone, so a multi-megabyte GIF round-trips without base64 inflation, and
 * its quota is orders of magnitude above localStorage's ~5 MB — a 20 000
 * element scene no longer fails to persist with `QuotaExceededError`.
 *
 * Every call degrades to a no-op (or an empty result) when IndexedDB is
 * unavailable — server-side rendering, private-mode lockdowns — so the
 * host keeps working without persistence rather than throwing.
 */

const DB_NAME = "oh-just-another-diagram";
const STORE = "files";
const SCENE_STORE = "scene";
const SCENE_KEY = "current";
const DB_VERSION = 2;

const hasIndexedDb = (): boolean => typeof indexedDB !== "undefined";

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * How long an open may stay `blocked` (another tab holds an older-version
 * connection) before we give up on persistence for this session rather than
 * hang the page on its first paint.
 */
const OPEN_BLOCKED_TIMEOUT_MS = 2000;

const openDb = (): Promise<IDBDatabase> => {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      // Let a later call retry instead of caching the failure forever.
      dbPromise = null;
      reject(err);
    };
    // A version upgrade waits for other tabs to release their connection;
    // without a bound the whole app would wait with it.
    const blockedTimer = setTimeout(() => {
      fail(new Error("indexedDB open blocked by another tab"));
    }, OPEN_BLOCKED_TIMEOUT_MS);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(SCENE_STORE)) db.createObjectStore(SCENE_STORE);
    };
    req.onblocked = () => {
      console.warn("[diagram] indexedDB upgrade blocked — close other tabs of this page");
    };
    req.onsuccess = () => {
      clearTimeout(blockedTimer);
      if (settled) {
        req.result.close();
        return;
      }
      settled = true;
      const db = req.result;
      // Be the tab that yields: when another tab upgrades the schema, drop
      // our connection so it isn't the one blocking them.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      clearTimeout(blockedTimer);
      fail(req.error ?? new Error("indexedDB open failed"));
    };
  });
  return dbPromise;
};

/** Read back every stored file, rebuilt into a `Scene.files` map. */
export const loadAllFiles = async (): Promise<Map<FileId, BinaryFile>> => {
  const out = new Map<FileId, BinaryFile>();
  if (!hasIndexedDb()) return out;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll() as IDBRequest<BinaryFile[]>;
    tx.oncomplete = () => {
      for (const f of req.result) {
        const id = castFileId(f.id);
        out.set(
          id,
          createBinaryFile(id, f.data, {
            mime: f.mime,
            createdAt: f.createdAt,
            ...(f.name !== undefined ? { name: f.name } : {}),
          }),
        );
      }
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error("indexedDB read failed"));
    };
  });
  return out;
};

/** Upsert each file under its id in a single transaction. */
export const saveFiles = async (files: ReadonlyMap<FileId, BinaryFile>): Promise<void> => {
  if (!hasIndexedDb() || files.size === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const [id, file] of files) store.put(file, id);
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error("indexedDB write failed"));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error("indexedDB write aborted"));
    };
  });
};

/**
 * Drop stored files whose id is no longer referenced, keeping the store
 * bounded as images come and go. `keep` is the id set of the scene being
 * saved; an undo that re-adds a shape also re-adds its file entry, so a
 * later save re-persists it.
 */
export const pruneFilesExcept = async (keep: ReadonlySet<string>): Promise<void> => {
  if (!hasIndexedDb()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      for (const key of keysReq.result) {
        // Keys are the string `fileId`s the bytes were stored under.
        if (typeof key === "string" && !keep.has(key)) store.delete(key);
      }
    };
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error("indexedDB prune failed"));
    };
  });
};

/** Persist the serialised scene JSON (bytes excluded — see `saveFiles`). */
export const saveSceneJson = async (json: string): Promise<void> => {
  if (!hasIndexedDb()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SCENE_STORE, "readwrite");
    tx.objectStore(SCENE_STORE).put(json, SCENE_KEY);
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error("indexedDB scene write failed"));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error("indexedDB scene write aborted"));
    };
  });
};

/** Read back the persisted scene JSON, or `null` when none was saved. */
export const loadSceneJson = async (): Promise<string | null> => {
  if (!hasIndexedDb()) return null;
  const db = await openDb();
  return new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(SCENE_STORE, "readonly");
    const req = tx.objectStore(SCENE_STORE).get(SCENE_KEY) as IDBRequest<string | undefined>;
    tx.oncomplete = () => {
      resolve(typeof req.result === "string" ? req.result : null);
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error("indexedDB scene read failed"));
    };
  });
};

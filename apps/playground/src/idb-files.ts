import { createBinaryFile, type BinaryFile } from "@oh-just-another/scene";
import { fileId as castFileId, type FileId } from "@oh-just-another/types";

/**
 * Browser-local store for a scene's binary assets (image / GIF bytes).
 *
 * The bytes live in IndexedDB, keyed by `fileId`, while the scene JSON
 * stays in localStorage. IndexedDB holds `ArrayBuffer`s natively through
 * structured clone, so a multi-megabyte GIF round-trips without base64
 * inflation and without competing for the small localStorage origin
 * quota — the difference between an image surviving a reload and silently
 * vanishing once it grows past a few megabytes.
 *
 * Every call degrades to a no-op (or an empty result) when IndexedDB is
 * unavailable — server-side rendering, private-mode lockdowns — so the
 * host keeps working without persistence rather than throwing.
 */

const DB_NAME = "oh-just-another-diagram";
const STORE = "files";
const DB_VERSION = 1;

const hasIndexedDb = (): boolean => typeof indexedDB !== "undefined";

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error("indexedDB open failed"));
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

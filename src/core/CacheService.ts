import { NoteSignature } from '../types';

const DB_NAME = 'duplicate-finder-cache';
const DB_VERSION = 1;
const STORE_NAME = 'signatures';

export class CacheService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(new Error(`IndexedDB error: ${request.error?.message ?? 'unknown'}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'path' });
          store.createIndex('mtime', 'mtime', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  async get(path: string): Promise<NoteSignature | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(path);

      request.onsuccess = () => resolve(request.result as NoteSignature | null);
      request.onerror = () => reject(new Error(`Get error: ${request.error?.message ?? 'unknown'}`));
    });
  }

  async getIfFresh(path: string, currentMtime: number): Promise<NoteSignature | null> {
    const cached = await this.get(path);
    if (cached && cached.mtime === currentMtime) {
      return cached;
    }
    return null;
  }

  async set(signature: NoteSignature): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(signature);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Set error: ${request.error?.message ?? 'unknown'}`));
    });
  }

  async setMany(signatures: NoteSignature[]): Promise<void> {
    await this.init();
    if (!this.db || signatures.length === 0) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`SetMany error: ${tx.error?.message ?? 'unknown'}`));

      for (const sig of signatures) {
        store.put(sig);
      }
    });
  }

  async delete(path: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(path);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Delete error: ${request.error?.message ?? 'unknown'}`));
    });
  }

  async clear(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Clear error: ${request.error?.message ?? 'unknown'}`));
    });
  }

  async getAllPaths(): Promise<string[]> {
    await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(new Error(`GetAllPaths error: ${request.error?.message ?? 'unknown'}`));
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { openDB, type IDBPDatabase } from 'idb';

export type OfflinePayloadType = 'VOICE_NOTE' | 'PHOTO' | 'VITALS';

export interface OfflineItem {
  id?: number;
  case_id: string;
  type: OfflinePayloadType;
  payload: any;
  timestamp: string;
  status?: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  retryCount?: number;
}

export interface QueueItemInput {
  case_id?: string;
  type: OfflinePayloadType;
  payload: any;
  timestamp?: string;
}

export interface FlushResult {
  success: boolean;
  syncedCount: number;
  items: OfflineItem[];
  error?: string;
}

const DB_NAME = 'telethread_outbox';
const DB_VERSION = 1;
const STORE_NAME = 'outbox';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only supported in browser environments'));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('case_id', 'case_id', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * useOfflineOutbox
 * 
 * Manages Tier 4 offline Store-and-Forward payloads using IndexedDB ('telethread_outbox').
 * Provides queueing, auto-sync upon bandwidth recovery, and manual flushing.
 */
export function useOfflineOutbox(caseId?: string) {
  const [pendingItems, setPendingItems] = useState<OfflineItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const isSyncingRef = useRef(false);

  // Refresh pending items from IndexedDB
  const refreshPendingItems = useCallback(async (): Promise<OfflineItem[]> => {
    try {
      const db = await getDB();
      let items: OfflineItem[] = [];

      if (caseId) {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const index = tx.store.index('case_id');
        items = await index.getAll(caseId);
      } else {
        items = await db.getAll(STORE_NAME);
      }

      // Sort chronological
      items.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
      setPendingItems(items);
      return items;
    } catch (err) {
      console.error('[TeleThread Outbox] Failed to read pending items:', err);
      return [];
    }
  }, [caseId]);

  // Load pending items on mount or when caseId changes
  useEffect(() => {
    refreshPendingItems();
  }, [refreshPendingItems]);

  // Queue a new offline item into IndexedDB
  const queueOfflineItem = useCallback(
    async (item: QueueItemInput): Promise<OfflineItem> => {
      const targetCaseId = item.case_id || caseId || 'UNKNOWN_CASE';
      const timestamp = item.timestamp || new Date().toISOString();

      const newItem: OfflineItem = {
        case_id: targetCaseId,
        type: item.type,
        payload: item.payload,
        timestamp,
        status: 'PENDING',
        retryCount: 0,
      };

      try {
        const db = await getDB();
        const generatedId = (await db.add(STORE_NAME, newItem)) as number;
        const savedItem = { ...newItem, id: generatedId };

        setPendingItems((prev) => [...prev, savedItem]);
        console.log(`[TeleThread Outbox] Queued ${item.type} (id: ${generatedId}) for case ${targetCaseId}`);
        return savedItem;
      } catch (err) {
        console.error('[TeleThread Outbox] Failed to queue offline item:', err);
        throw err;
      }
    },
    [caseId]
  );

  // Delete a specific offline item by ID
  const removeOfflineItem = useCallback(async (id: number): Promise<void> => {
    try {
      const db = await getDB();
      await db.delete(STORE_NAME, id);
      setPendingItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error(`[TeleThread Outbox] Failed to delete item ${id}:`, err);
    }
  }, []);

  // Clear all pending items for the case
  const clearOutbox = useCallback(async (): Promise<void> => {
    try {
      const db = await getDB();
      if (caseId) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const index = tx.store.index('case_id');
        let cursor = await index.openCursor(caseId);
        while (cursor) {
          await cursor.delete();
          cursor = await cursor.continue();
        }
        await tx.done;
      } else {
        await db.clear(STORE_NAME);
      }
      setPendingItems([]);
    } catch (err) {
      console.error('[TeleThread Outbox] Failed to clear outbox:', err);
    }
  }, [caseId]);

  // Flush queued items to the backend API: POST /api/cases/{caseId}/sync-outbox
  const flushOutbox = useCallback(
    async (
      apiBaseUrl: string = 'http://localhost:8000',
      onFlushSuccess?: (syncedItems: OfflineItem[]) => void
    ): Promise<FlushResult> => {
      if (isSyncingRef.current) {
        return { success: false, syncedCount: 0, items: [], error: 'Sync already in progress' };
      }

      const itemsToSync = await refreshPendingItems();
      if (itemsToSync.length === 0) {
        return { success: true, syncedCount: 0, items: [] };
      }

      isSyncingRef.current = true;
      setIsSyncing(true);
      setLastSyncError(null);

      const cleanBase = apiBaseUrl.replace(/\/+$/, '');
      const targetCaseId = caseId || itemsToSync[0]?.case_id || 'UNKNOWN';
      const endpoint = `${cleanBase}/api/cases/${targetCaseId}/sync-outbox`;

      try {
        console.log(`[TeleThread Outbox] Flushing ${itemsToSync.length} items to ${endpoint}...`);
        
        const payload = {
          case_id: targetCaseId,
          sync_timestamp: new Date().toISOString(),
          items: itemsToSync.map(({ id, ...itemData }) => itemData),
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }

        // Successfully sent: remove synced items from IndexedDB
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        for (const item of itemsToSync) {
          if (item.id !== undefined) {
            await tx.store.delete(item.id);
          }
        }
        await tx.done;

        const now = new Date().toLocaleTimeString();
        setLastSyncTime(now);
        setPendingItems([]);

        console.log(`[TeleThread Outbox] Successfully synced ${itemsToSync.length} items!`);
        if (onFlushSuccess) {
          onFlushSuccess(itemsToSync);
        }

        return {
          success: true,
          syncedCount: itemsToSync.length,
          items: itemsToSync,
        };
      } catch (err: any) {
        const errorMsg = err?.message || 'Sync failed';
        console.warn(`[TeleThread Outbox] Flush failed (items preserved in IndexedDB): ${errorMsg}`);
        setLastSyncError(errorMsg);
        return {
          success: false,
          syncedCount: 0,
          items: itemsToSync,
          error: errorMsg,
        };
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [caseId, refreshPendingItems]
  );

  return {
    pendingItems,
    queueOfflineItem,
    flushOutbox,
    clearOutbox,
    removeOfflineItem,
    refreshPendingItems,
    isSyncing,
    lastSyncError,
    lastSyncTime,
  };
}

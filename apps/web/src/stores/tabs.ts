import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CollectionTab {
  /** Stable key: cid|db|col */
  id: string;
  cid: string;
  db: string;
  col: string;
  connectionName?: string;
}

function tabId(cid: string, db: string, col: string): string {
  return `${cid}|${db}|${col}`;
}

interface TabsState {
  tabs: CollectionTab[];
  activeId: string | null;
  openTab: (tab: Omit<CollectionTab, 'id'> & { id?: string }) => CollectionTab;
  closeTab: (id: string) => string | null;
  setActive: (id: string | null) => void;
  closeOthers: (id: string) => void;
  closeAll: () => void;
  renameConnection: (cid: string, name: string) => void;
}

export function makeTabId(cid: string, db: string, col: string): string {
  return tabId(cid, db, col);
}

export function tabPath(tab: CollectionTab): string {
  return `/c/${tab.cid}/db/${encodeURIComponent(tab.db)}/col/${encodeURIComponent(tab.col)}`;
}

export const useTabsStore = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeId: null,

      openTab: (input) => {
        const id = input.id ?? tabId(input.cid, input.db, input.col);
        const existing = get().tabs.find((t) => t.id === id);
        if (existing) {
          set({ activeId: id });
          if (input.connectionName && input.connectionName !== existing.connectionName) {
            set({
              tabs: get().tabs.map((t) =>
                t.id === id ? { ...t, connectionName: input.connectionName } : t,
              ),
            });
          }
          return get().tabs.find((t) => t.id === id)!;
        }
        const tab: CollectionTab = {
          id,
          cid: input.cid,
          db: input.db,
          col: input.col,
          connectionName: input.connectionName,
        };
        set({ tabs: [...get().tabs, tab], activeId: id });
        return tab;
      },

      closeTab: (id) => {
        const { tabs, activeId } = get();
        const idx = tabs.findIndex((t) => t.id === id);
        if (idx < 0) return activeId;
        const nextTabs = tabs.filter((t) => t.id !== id);
        let nextActive = activeId;
        if (activeId === id) {
          const neighbor = nextTabs[Math.min(idx, nextTabs.length - 1)] ?? null;
          nextActive = neighbor?.id ?? null;
        }
        set({ tabs: nextTabs, activeId: nextActive });
        return nextActive;
      },

      setActive: (id) => set({ activeId: id }),

      closeOthers: (id) => {
        const keep = get().tabs.find((t) => t.id === id);
        set({ tabs: keep ? [keep] : [], activeId: keep?.id ?? null });
      },

      closeAll: () => set({ tabs: [], activeId: null }),

      renameConnection: (cid, name) =>
        set({
          tabs: get().tabs.map((t) => (t.cid === cid ? { ...t, connectionName: name } : t)),
        }),
    }),
    { name: 'vast-collection-tabs' },
  ),
);

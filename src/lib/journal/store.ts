import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { tradeFingerprint } from "./calc.ts";
import { presetPlaybooks } from "./playbooks.ts";
import { buildSample } from "./sample.ts";
import type { Checks, JournalBackup, Playbook, Rule, Trade } from "./types.ts";

const JOURNAL_STORAGE_KEY = "santandc-journal-v1";
const LEGACY_JOURNAL_STORAGE_KEY = "folio-journal-v1";

/** Preserve journals saved before the SANTANDC rename. */
function migrateLegacyStorageKey() {
  try {
    if (localStorage.getItem(JOURNAL_STORAGE_KEY)) return;
    const legacy = localStorage.getItem(LEGACY_JOURNAL_STORAGE_KEY);
    if (legacy) localStorage.setItem(JOURNAL_STORAGE_KEY, legacy);
  } catch {
    // Storage may be unavailable in a restricted browser context.
  }
}

type JournalState = {
  trades: Trade[];
  rules: Rule[];
  checks: Checks;
  startingBalance: number;
  initialized: boolean;
  sampleBanner: boolean;
  playbooks: Playbook[];
  activePlaybookId: string | null;
  addTrade: (trade: Trade) => void;
  updateTrade: (trade: Trade) => void;
  deleteTrade: (id: string) => void;
  addRule: (text: string) => void;
  updateRule: (id: string, text: string) => void;
  deleteRule: (id: string) => void;
  toggleCheck: (date: string, ruleId: string) => void;
  setStartingBalance: (value: number) => void;
  loadSample: () => void;
  clearTrades: () => void;
  dismissSample: () => void;
  replaceAll: (data: JournalBackup) => void;
  importTrades: (incoming: Trade[]) => void;
  addPlaybook: (playbook: Playbook) => void;
  updatePlaybook: (playbook: Playbook) => void;
  deletePlaybook: (id: string) => void;
  setActivePlaybook: (id: string | null) => void;
};

export const useJournal = create<JournalState>()(
  persist(
    (set) => ({
      trades: [],
      rules: [],
      checks: {},
      startingBalance: 25000,
      initialized: false,
      sampleBanner: false,
      playbooks: presetPlaybooks(),
      activePlaybookId: "playbook-trend-pullback",
      addTrade: (trade) =>
        set((s) => ({ trades: [trade, ...s.trades], sampleBanner: false })),
      importTrades: (incoming) =>
        set((s) => {
          const seenIds = new Set(s.trades.map((trade) => trade.id));
          const seenTrades = new Set(s.trades.map((trade) => tradeFingerprint(trade)));
          const merged: Trade[] = [];
          for (const trade of incoming) {
            const fingerprint = tradeFingerprint(trade);
            // Re-importing the same broker/CSV file should be a no-op, not a
            // second copy of the book under fresh IDs.
            if (seenTrades.has(fingerprint)) continue;
            const next = seenIds.has(trade.id) ? { ...trade, id: crypto.randomUUID() } : trade;
            seenIds.add(next.id);
            seenTrades.add(fingerprint);
            merged.push(next);
          }
          return { trades: [...merged, ...s.trades], sampleBanner: false, initialized: true };
        }),
      updateTrade: (trade) =>
        set((s) => ({
          trades: s.trades.map((item) => (item.id === trade.id ? trade : item)),
          sampleBanner: false,
        })),
      deleteTrade: (id) =>
        set((s) => ({
          trades: s.trades.filter((item) => item.id !== id),
          sampleBanner: false,
        })),
      addRule: (text) =>
        set((s) => ({
          rules: [...s.rules, { id: crypto.randomUUID(), text: text.trim() }],
          sampleBanner: false,
        })),
      updateRule: (id, text) =>
        set((s) => ({
          rules: s.rules.map((rule) => (rule.id === id ? { ...rule, text } : rule)),
          sampleBanner: false,
        })),
      deleteRule: (id) =>
        set((s) => ({
          rules: s.rules.filter((rule) => rule.id !== id),
          checks: Object.fromEntries(
            Object.entries(s.checks).map(([date, ids]) => [date, ids.filter((ruleId) => ruleId !== id)]),
          ),
          sampleBanner: false,
        })),
      toggleCheck: (date, ruleId) =>
        set((s) => {
          const current = s.checks[date] ?? [];
          const next = current.includes(ruleId)
            ? current.filter((id) => id !== ruleId)
            : [...current, ruleId];
          return { checks: { ...s.checks, [date]: next }, sampleBanner: false };
        }),
      setStartingBalance: (value) => set({ startingBalance: value, sampleBanner: false }),
      loadSample: () => {
        const sample = buildSample();
        set({
          trades: sample.trades,
          rules: sample.rules,
          checks: {},
          startingBalance: 25000,
          initialized: true,
          sampleBanner: true,
          playbooks: sample.playbooks,
          activePlaybookId: sample.activePlaybookId,
        });
      },
      clearTrades: () => set({ trades: [], checks: {}, sampleBanner: false, initialized: true }),
      dismissSample: () => set({ sampleBanner: false }),
      replaceAll: (data) =>
        set({
          trades: data.trades,
          rules: data.rules,
          checks: data.checks,
          startingBalance: data.startingBalance,
          sampleBanner: false,
          initialized: true,
          playbooks: data.playbooks,
          activePlaybookId: data.activePlaybookId,
        }),
      addPlaybook: (playbook) =>
        set((s) => ({
          playbooks: [...s.playbooks, playbook],
          activePlaybookId: s.activePlaybookId ?? playbook.id,
          sampleBanner: false,
        })),
      updatePlaybook: (playbook) =>
        set((s) => ({
          playbooks: s.playbooks.map((item) => (item.id === playbook.id ? playbook : item)),
          sampleBanner: false,
        })),
      deletePlaybook: (id) =>
        set((s) => ({
          playbooks: s.playbooks.filter((item) => item.id !== id),
          activePlaybookId: s.activePlaybookId === id ? (s.playbooks.find((item) => item.id !== id)?.id ?? null) : s.activePlaybookId,
          trades: s.trades.map((trade) => (trade.playbookId === id ? { ...trade, playbookId: null } : trade)),
          sampleBanner: false,
        })),
      setActivePlaybook: (id) => set({ activePlaybookId: id }),
    }),
    {
      name: JOURNAL_STORAGE_KEY,
      version: 1,
      migrate: (persistedState, version) => {
        if (version >= 1) return persistedState as JournalState;
        const state = (persistedState ?? {}) as Partial<JournalState> & {
          trades?: Array<Trade & { multiplier?: number }>;
        };
        return {
          ...state,
          trades: (state.trades ?? []).map((trade) => ({
            ...trade,
            multiplier:
              typeof trade.multiplier === "number" && trade.multiplier > 0 ? trade.multiplier : 1,
          })),
        } as unknown as JournalState;
      },
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        trades: s.trades,
        rules: s.rules,
        checks: s.checks,
        startingBalance: s.startingBalance,
        initialized: s.initialized,
        sampleBanner: s.sampleBanner,
        playbooks: s.playbooks,
        activePlaybookId: s.activePlaybookId,
      }),
    },
  ),
);

export function useHydrateJournal(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    migrateLegacyStorageKey();
    let cancel = false;
    const finish = () => {
      if (cancel) return;
      if (!useJournal.getState().initialized) useJournal.getState().loadSample();
      setReady(true);
    };
    if (useJournal.persist.hasHydrated()) {
      finish();
      return () => {
        cancel = true;
      };
    }
    const unsub = useJournal.persist.onFinishHydration(finish);
    void useJournal.persist.rehydrate();
    return () => {
      cancel = true;
      unsub();
    };
  }, []);
  return ready;
}

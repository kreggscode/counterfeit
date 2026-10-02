/**
 * Scoring, streaks and the little bit of state that survives a reload.
 *
 * Everything takes its storage as an argument so the rules can be exercised
 * without a browser.
 */

import { TIERS, type Matchup, type Side, type Tier } from "./rounds.js";

export type Verdict = "correct" | "wrong" | "timeout";

export type Mode = "image" | "caption" | "mixed";

export type Settings = { mode: Mode; tier: Tier | "all"; fresh: boolean };

export const DEFAULT_SETTINGS: Settings = { mode: "image", tier: "all", fresh: true };

export const MODES: readonly Mode[] = ["image", "caption", "mixed"] as const;

/** ms a round runs for. Reading a paragraph takes longer than judging a photo. */
export const ROUND_MS: Record<"image" | "caption", number> = { image: 15_000, caption: 25_000 };

const BASE_POINTS = 10;
const SPEED_POINTS = 10;

/** A correct answer scores 10, plus up to 10 more for answering quickly. */
export const score = (
    verdict: Verdict,
    remainingMs: number,
    totalMs: number,
    streakBefore: number,
): { points: number; streak: number } => {
    if (verdict !== "correct") return { points: 0, streak: 0 };
    const speed = totalMs > 0 ? Math.round((Math.max(0, remainingMs) / totalMs) * SPEED_POINTS) : 0;
    return { points: BASE_POINTS + speed, streak: streakBefore + 1 };
};

export type Result = { id: string; verdict: Verdict; points: number; streak: number };

export type Summary = {
    correct: number;
    total: number;
    points: number;
    bestStreak: number;
};

export const summarise = (results: readonly Result[]): Summary => {
    let correct = 0;
    let points = 0;
    let bestStreak = 0;
    for (const result of results) {
        if (result.verdict === "correct") correct += 1;
        points += result.points;
        if (result.streak > bestStreak) bestStreak = result.streak;
    }
    return { correct, total: results.length, points, bestStreak };
};

export const answer = (
    matchup: Matchup,
    picked: Side | null,
    remainingMs: number,
    totalMs: number,
    streakBefore: number,
): { verdict: Verdict; points: number; streak: number } => {
    const verdict: Verdict =
        picked === null || remainingMs <= 0
            ? "timeout"
            : picked === matchup.fakeOn
              ? "correct"
              : "wrong";
    const { points, streak } = score(verdict, remainingMs, totalMs, streakBefore);
    return { verdict, points, streak };
};

/* --------------------------------------------------------------- storage */

export const BEST_STREAK_KEY = "counterfeit.bestStreak";
export const SETTINGS_KEY = "counterfeit.settings";

const storageOf = (store?: Storage): Storage | null => {
    if (store) return store;
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
};

export const readNumber = (key: string, store?: Storage): number => {
    const raw = storageOf(store)?.getItem(key);
    const parsed = raw === null || raw === undefined ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const writeNumber = (key: string, value: number, store?: Storage): void => {
    storageOf(store)?.setItem(key, String(Math.max(0, Math.round(value))));
};

export const readSettings = (store?: Storage): Settings => {
    const raw = storageOf(store)?.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
        const candidate = parsed as Partial<Settings>;
        const mode = MODES.includes(candidate.mode as Mode) ? (candidate.mode as Mode) : DEFAULT_SETTINGS.mode;
        const tier =
            candidate.tier === "all" || TIERS.includes(candidate.tier as Tier)
                ? ((candidate.tier as Tier | "all") ?? "all")
                : DEFAULT_SETTINGS.tier;
        const fresh = typeof candidate.fresh === "boolean" ? candidate.fresh : DEFAULT_SETTINGS.fresh;
        return { mode, tier, fresh };
    } catch {
        return DEFAULT_SETTINGS;
    }
};

export const writeSettings = (settings: Settings, store?: Storage): void => {
    storageOf(store)?.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

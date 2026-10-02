import { describe, expect, it } from "vitest";
import {
    BEST_STREAK_KEY,
    DEFAULT_SETTINGS,
    SETTINGS_KEY,
    answer,
    readNumber,
    readSettings,
    score,
    summarise,
    writeNumber,
    writeSettings,
    type Result,
} from "./game.js";
import { parseRounds, type Round } from "./rounds.js";
import raw from "./rounds.json";

const rounds: Round[] = parseRounds(raw);
const aRound = rounds[0];
const matchWithFakeOnB = { round: aRound, fakeOn: "b" } as const;

const fakeStore = (): Storage => {
    const data = new Map<string, string>();
    return {
        get length() {
            return data.size;
        },
        clear: () => data.clear(),
        getItem: (key: string) => data.get(key) ?? null,
        key: (index: number) => [...data.keys()][index] ?? null,
        removeItem: (key: string) => void data.delete(key),
        setItem: (key: string, value: string) => void data.set(key, value),
    } as Storage;
};

describe("score", () => {
    it("pays full marks for an instant correct answer", () => {
        expect(score("correct", 15_000, 15_000, 0)).toEqual({ points: 20, streak: 1 });
    });

    it("pays the base for a correct answer with no time left", () => {
        expect(score("correct", 0, 15_000, 4)).toEqual({ points: 10, streak: 5 });
    });

    it("scales the speed bonus with the time remaining", () => {
        expect(score("correct", 7_500, 15_000, 0).points).toBe(15);
        expect(score("correct", 1_500, 15_000, 0).points).toBe(11);
    });

    it("pays nothing and breaks the streak when wrong", () => {
        expect(score("wrong", 10_000, 15_000, 6)).toEqual({ points: 0, streak: 0 });
        expect(score("timeout", 0, 15_000, 6)).toEqual({ points: 0, streak: 0 });
    });

    it("does not pay a speed bonus for a non-scoring answer", () => {
        expect(score("wrong", 15_000, 0, 0).points).toBe(0);
    });
});

describe("answer", () => {
    it("credits a pick that lands on the fake", () => {
        expect(answer(matchWithFakeOnB, "b", 15_000, 15_000, 0).verdict).toBe("correct");
        expect(answer(matchWithFakeOnB, "b", 15_000, 15_000, 0).streak).toBe(1);
    });

    it("charges a pick that lands on the real photograph", () => {
        const outcome = answer(matchWithFakeOnB, "a", 5_000, 15_000, 3);
        expect(outcome.verdict).toBe("wrong");
        expect(outcome.points).toBe(0);
        expect(outcome.streak).toBe(0);
    });

    it("calls it a timeout once the clock has run out", () => {
        expect(answer(matchWithFakeOnB, "b", 0, 15_000, 2).verdict).toBe("timeout");
    });

    it("calls it a timeout when nobody answered", () => {
        expect(answer(matchWithFakeOnB, null, 8_000, 15_000, 2).verdict).toBe("timeout");
        expect(answer(matchWithFakeOnB, null, 8_000, 15_000, 2).points).toBe(0);
    });
});

describe("summarise", () => {
    const results: Result[] = [
        { id: "fox", verdict: "correct", points: 20, streak: 1 },
        { id: "tart", verdict: "wrong", points: 0, streak: 0 },
        { id: "owl", verdict: "correct", points: 14, streak: 1 },
        { id: "reef", verdict: "correct", points: 12, streak: 2 },
        { id: "lake", verdict: "timeout", points: 0, streak: 0 },
    ];

    it("adds up the run", () => {
        expect(summarise(results)).toEqual({
            correct: 3,
            total: 5,
            points: 46,
            bestStreak: 2,
        });
    });

    it("scores an empty run as nothing at all", () => {
        expect(summarise([])).toEqual({ correct: 0, total: 0, points: 0, bestStreak: 0 });
    });
});

describe("storage", () => {
    it("round-trips the best streak", () => {
        const store = fakeStore();
        expect(readNumber(BEST_STREAK_KEY, store)).toBe(0);
        writeNumber(BEST_STREAK_KEY, 7.6, store);
        expect(readNumber(BEST_STREAK_KEY, store)).toBe(8);
    });

    it("treats junk in storage as no record", () => {
        const store = fakeStore();
        store.setItem(BEST_STREAK_KEY, "not a number");
        expect(readNumber(BEST_STREAK_KEY, store)).toBe(0);
        store.setItem(BEST_STREAK_KEY, "-4");
        expect(readNumber(BEST_STREAK_KEY, store)).toBe(0);
    });

    it("round-trips settings", () => {
        const store = fakeStore();
        writeSettings({ mode: "caption", tier: "hard", fresh: false }, store);
        expect(readSettings(store)).toEqual({ mode: "caption", tier: "hard", fresh: false });
    });

    it("falls back to the defaults when settings are unreadable", () => {
        const store = fakeStore();
        store.setItem(SETTINGS_KEY, "{not json");
        expect(readSettings(store)).toEqual(DEFAULT_SETTINGS);
        store.setItem(SETTINGS_KEY, JSON.stringify({ mode: "nonsense" }));
        expect(readSettings(store)).toEqual(DEFAULT_SETTINGS);
    });

    it("ignores a mode or tier it does not recognise", () => {
        const store = fakeStore();
        store.setItem(SETTINGS_KEY, JSON.stringify({ mode: "video", tier: "impossible", fresh: true }));
        expect(readSettings(store)).toEqual(DEFAULT_SETTINGS);
    });
});

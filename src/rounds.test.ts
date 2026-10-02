import { describe, expect, it } from "vitest";
import raw from "./rounds.json";
import {
    assetUrl,
    caption,
    deal,
    isFake,
    parseRounds,
    picture,
    selectRounds,
    type Round,
} from "./rounds.js";

const rounds = parseRounds(raw);

const counts = (list: readonly Round[]) => ({
    image: list.filter((round) => round.kind === "image").length,
    caption: list.filter((round) => round.kind === "caption").length,
});

/** Deterministic stand-in for Math.random so a shuffle can be asserted. */
const rng = (seed: number) => {
    let s = seed;
    return () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
    };
};

describe("committed rounds", () => {
    it("parses every entry in rounds.json", () => {
        expect(rounds.length).toBe(raw.length);
        expect(rounds.length).toBe(18);
    });

    it("pairs twelve pictures with six paragraphs", () => {
        expect(counts(rounds)).toEqual({ image: 12, caption: 6 });
    });

    it("gives every difficulty level the same number of rounds", () => {
        const byTier = (tier: string) => rounds.filter((round) => round.tier === tier).length;
        expect(byTier("easy")).toBe(6);
        expect(byTier("medium")).toBe(6);
        expect(byTier("hard")).toBe(6);
    });

    it("credits every photograph", () => {
        for (const round of rounds) {
            if (round.kind !== "image") continue;
            expect(round.real.title).not.toBe("");
            expect(round.real.author).not.toBe("");
            expect(round.real.licence).not.toBe("");
            expect(round.real.page).toMatch(/^https:\/\//);
        }
    });

    it("records the Pollinations model and prompt behind every fake", () => {
        for (const round of rounds) {
            if (round.kind !== "image") continue;
            expect(round.fake.model).toMatch(/\//);
            expect(round.fake.prompt.length).toBeGreaterThan(30);
        }
    });

    it("writes real paragraphs and generated ones of a readable length", () => {
        for (const round of rounds) {
            if (round.kind !== "caption") continue;
            expect(round.real.text.length).toBeGreaterThanOrEqual(40);
            expect(round.fake.text.length).toBeGreaterThanOrEqual(40);
            expect(round.real.text).not.toBe(round.fake.text);
        }
    });

    it("explains what gave the fake away on every round", () => {
        for (const round of rounds) expect(round.tell.length).toBeGreaterThan(30);
    });
});

describe("parseRounds", () => {
    it("returns nothing for anything that is not an array", () => {
        expect(parseRounds(undefined)).toEqual([]);
        expect(parseRounds({ kind: "image" })).toEqual([]);
    });

    it("drops entries that are missing the pieces a round needs", () => {
        const parsed = parseRounds([
            { id: "ok", kind: "caption", subject: "a subject", tier: "easy", real: { text: "x".repeat(60) }, fake: { text: "y".repeat(60) }, tell: "a long enough explanation of the tell" },
            { id: "short", kind: "caption", subject: "a subject", tier: "easy", real: { text: "too short" }, fake: { text: "y".repeat(60) }, tell: "a long enough explanation of the tell" },
            { id: "no-tier", kind: "caption", subject: "a subject", real: { text: "x".repeat(60) }, fake: { text: "y".repeat(60) }, tell: "a long enough explanation of the tell" },
            { id: "no-tell", kind: "caption", subject: "a subject", tier: "easy", real: { text: "x".repeat(60) }, fake: { text: "y".repeat(60) }, tell: "" },
            "not an object",
        ]);
        expect(parsed.map((round) => round.id)).toEqual(["ok"]);
    });
});

describe("selectRounds", () => {
    it("filters to a single kind", () => {
        expect(counts(selectRounds(rounds, "image", "all"))).toEqual({ image: 12, caption: 0 });
        expect(counts(selectRounds(rounds, "caption", "all"))).toEqual({ image: 0, caption: 6 });
    });

    it("filters to a single difficulty", () => {
        const hard = selectRounds(rounds, "mixed", "hard");
        expect(hard.length).toBe(6);
        expect(hard.every((round) => round.tier === "hard")).toBe(true);
    });

    it("combines both filters", () => {
        expect(selectRounds(rounds, "image", "easy").length).toBe(4);
        expect(selectRounds(rounds, "caption", "easy").length).toBe(2);
    });
});

describe("deal", () => {
    it("keeps every round exactly once", () => {
        const dealt = deal(rounds, rng(7));
        expect(dealt.length).toBe(rounds.length);
        expect(new Set(dealt.map((matchup) => matchup.round.id)).size).toBe(rounds.length);
    });

    it("puts the fake on either side", () => {
        const dealt = deal(rounds, rng(11));
        const sides = new Set(dealt.map((matchup) => matchup.fakeOn));
        expect(sides).toEqual(new Set(["a", "b"]));
    });

    it("is reproducible for a given seed", () => {
        expect(deal(rounds, rng(3))).toEqual(deal(rounds, rng(3)));
    });
});

describe("sides", () => {
    const image = rounds.find((round) => round.kind === "image")!;
    const text = rounds.find((round) => round.kind === "caption")!;

    it("shows the fake only on the side that carries it", () => {
        const matchup = { round: image, fakeOn: "b" } as const;
        expect(isFake(matchup, "a")).toBe(false);
        expect(isFake(matchup, "b")).toBe(true);
        expect(picture(matchup, "a")).toBe(image.real.file);
        expect(picture(matchup, "b")).toBe(image.fake.file);
    });

    it("swaps which paragraph sits where", () => {
        const matchup = { round: text, fakeOn: "a" } as const;
        expect(caption(matchup, "a")).toBe(text.fake.text);
        expect(caption(matchup, "b")).toBe(text.real.text);
    });

    it("refuses to answer for the other kind of round", () => {
        const matchup = { round: text, fakeOn: "a" } as const;
        expect(picture(matchup, "a")).toBe("");
        expect(caption({ round: image, fakeOn: "a" }, "a")).toBe("");
    });
});

describe("assetUrl", () => {
    it("prefixes the GitHub Pages base path", () => {
        expect(assetUrl("fakes/fox.jpg")).toMatch(/fakes\/fox\.jpg$/);
        expect(assetUrl("fakes/fox.jpg").startsWith("/")).toBe(true);
    });
});

/**
 * Round data and the pure helpers around it.
 *
 * The round list itself is authored by `scripts/author.mjs`, which pairs a
 * Wikimedia Commons photograph with a Pollinations-generated twin (or a
 * Wikipedia lead with a model-written paragraph) and drops the result in
 * src/rounds.json. Nothing here talks to the network.
 */

export type Tier = "easy" | "medium" | "hard";
export type Kind = "image" | "caption";
export type Side = "a" | "b";

export const TIERS: readonly Tier[] = ["easy", "medium", "hard"] as const;
export const KINDS: readonly Kind[] = ["image", "caption"] as const;

export type ImageRound = {
    id: string;
    kind: "image";
    subject: string;
    tier: Tier;
    real: { file: string; title: string; page: string; author: string; licence: string };
    fake: { file: string; model: string; prompt: string };
    tell: string;
};

export type CaptionRound = {
    id: string;
    kind: "caption";
    subject: string;
    tier: Tier;
    real: { text: string; source: string; page: string };
    fake: { text: string; model: string };
    tell: string;
};

export type Round = ImageRound | CaptionRound;

/** One half of the pair the player actually sees. */
export type Matchup = { round: Round; fakeOn: Side };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const isTier = (value: unknown): value is Tier => TIERS.includes(value as Tier);

const parseImage = (raw: Record<string, unknown>): ImageRound | null => {
    const real = raw.real;
    const fake = raw.fake;
    if (!isRecord(real) || !isRecord(fake)) return null;
    const subject = text(raw.subject);
    const tell = text(raw.tell);
    if (subject === "" || tell === "") return null;
    if (text(real.file) === "" || text(fake.file) === "") return null;
    return {
        id: text(raw.id),
        kind: "image",
        subject,
        tier: raw.tier as Tier,
        real: {
            file: text(real.file),
            title: text(real.title),
            page: text(real.page),
            author: text(real.author) || "Unknown",
            licence: text(real.licence) || "Unknown",
        },
        fake: { file: text(fake.file), model: text(fake.model), prompt: text(fake.prompt) },
        tell,
    };
};

const parseCaption = (raw: Record<string, unknown>): CaptionRound | null => {
    const real = raw.real;
    const fake = raw.fake;
    if (!isRecord(real) || !isRecord(fake)) return null;
    const subject = text(raw.subject);
    const tell = text(raw.tell);
    const copy = text(real.text);
    const written = text(fake.text);
    if (subject === "" || tell === "") return null;
    if (copy.length < 40 || written.length < 40) return null;
    return {
        id: text(raw.id),
        kind: "caption",
        subject,
        tier: raw.tier as Tier,
        real: { text: copy, source: text(real.source) || "Wikipedia", page: text(real.page) },
        fake: { text: written, model: text(fake.model) },
        tell,
    };
};

/**
 * Keep the rounds that can actually be played and quietly drop the rest, so a
 * single malformed entry never takes the whole game down with it.
 */
export const parseRounds = (raw: unknown): Round[] => {
    if (!Array.isArray(raw)) return [];
    const out: Round[] = [];
    for (const entry of raw) {
        if (!isRecord(entry)) continue;
        if (!isTier(entry.tier)) continue;
        const parsed = entry.kind === "image" ? parseImage(entry) : entry.kind === "caption" ? parseCaption(entry) : null;
        if (parsed && parsed.id !== "") out.push(parsed);
    }
    return out;
};

/** Playable rounds only: a category needs both sides of the pair. */
export const selectRounds = (
    all: readonly Round[],
    mode: "image" | "caption" | "mixed",
    tier: Tier | "all",
): Round[] =>
    all.filter(
        (round) =>
            (mode === "mixed" || round.kind === mode) && (tier === "all" || round.tier === tier),
    );

const shuffled = <T,>(items: readonly T[], random: () => number): T[] => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

/** Randomised order with a swappable RNG, so the shuffle is testable. */
export const deal = (rounds: readonly Round[], random: () => number = Math.random): Matchup[] =>
    shuffled(rounds, random).map((round) => ({ round, fakeOn: random() < 0.5 ? "a" : "b" }));

/** The image the given side shows. */
export const picture = (matchup: Matchup, side: Side): string => {
    const { round, fakeOn } = matchup;
    if (round.kind !== "image") return "";
    return side === fakeOn ? round.fake.file : round.real.file;
};

/** The paragraph the given side shows. */
export const caption = (matchup: Matchup, side: Side): string => {
    const { round, fakeOn } = matchup;
    if (round.kind !== "caption") return "";
    return side === fakeOn ? round.fake.text : round.real.text;
};

export const isFake = (matchup: Matchup, side: Side): boolean => matchup.fakeOn === side;

/** Assets live in `public/`, so BASE_URL (/counterfeit/) prefixes every path. */
export const assetUrl = (file: string): string => `${import.meta.env.BASE_URL}${file}`;

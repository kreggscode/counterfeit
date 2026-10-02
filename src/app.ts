import raw from "./rounds.json";
import { button, clear, h } from "./dom.js";
import { liveImage, seedFor } from "./api.js";
import {
    BEST_STREAK_KEY,
    MODES,
    ROUND_MS,
    answer,
    readNumber,
    readSettings,
    summarise,
    writeNumber,
    writeSettings,
    type Mode,
    type Result,
    type Settings,
    type Verdict,
} from "./game.js";
import {
    TIERS,
    assetUrl,
    caption,
    deal,
    isFake,
    parseRounds,
    picture,
    selectRounds,
    type Matchup,
    type Side,
    type Tier,
} from "./rounds.js";

type Phase = "home" | "playing" | "reveal" | "summary";

type State = {
    settings: Settings;
    queue: Matchup[];
    index: number;
    results: Result[];
    streak: number;
    points: number;
    phase: Phase;
    picked: Side | null;
    last: { verdict: Verdict; points: number; streak: number } | null;
    best: number;
    busy: boolean;
    deadline: number;
    totalMs: number;
};

const ROUNDS = parseRounds(raw);

let clock: number | null = null;
let settled = 0;

const freshState = (settings: Settings): State => ({
    settings,
    queue: [],
    index: 0,
    results: [],
    streak: 0,
    points: 0,
    phase: "home",
    picked: null,
    last: null,
    best: readNumber(BEST_STREAK_KEY),
    busy: false,
    deadline: 0,
    totalMs: 0,
});

const stopClock = () => {
    if (clock !== null) {
        window.clearInterval(clock);
        clock = null;
    }
};

const bump = (root: HTMLElement) => {
    settled += 1;
    root.dataset.settled = String(settled);
};

const current = (state: State): Matchup | null => state.queue[state.index] ?? null;

const tierLabel = (tier: Tier | "all"): string =>
    tier === "all" ? "All" : tier[0].toUpperCase() + tier.slice(1);

/* ------------------------------------------------------------------ chips */

const chip = (
    label: string,
    active: boolean,
    attr: string,
    value: string,
    onPick: () => void,
): HTMLButtonElement =>
    h("button", {
        class: `chip${active ? " on" : ""}`,
        type: "button",
        [attr]: value,
        "aria-pressed": active ? "true" : "false",
        text: label,
        onclick: onPick,
    });

/* -------------------------------------------------------------- media box */

/**
 * Shows a picture, optionally asking Pollinations for a brand new one first.
 * A failed live request silently drops back to the committed file, so the round
 * is always playable.
 */
const pictureFrame = (alt: string, file: string, live: string | null): HTMLElement => {
    const frame = h("span", { class: "frame loading" });
    const img = h("img", {
        alt,
        "data-slot": alt,
        src: live ?? assetUrl(file),
        onload: () => {
            frame.classList.remove("loading");
            frame.classList.add("ready");
        },
        onerror: () => {
            if (img.getAttribute("src") !== assetUrl(file)) {
                img.src = assetUrl(file);
                return;
            }
            frame.classList.remove("loading");
            frame.classList.add("failed");
        },
    });
    if (live !== null) img.dataset.live = "true";
    frame.append(
        h("span", {
            class: "skeleton",
            text: live === null ? "Loading…" : "Pollinations is drawing…",
        }),
        img,
    );
    return frame;
};

/* ------------------------------------------------------------------ home */

const renderHome = (root: HTMLElement, state: State, rerender: () => void) => {
    const apply = (patch: Partial<Settings>) => {
        state.settings = { ...state.settings, ...patch };
        writeSettings(state.settings);
        rerender();
    };

    const start = () => {
        if (state.busy) return;
        const chosen = selectRounds(ROUNDS, state.settings.mode, state.settings.tier);
        if (chosen.length === 0) return;
        state.busy = true;
        state.queue = deal(chosen);
        state.index = 0;
        state.results = [];
        state.streak = 0;
        state.points = 0;
        state.picked = null;
        state.last = null;
        state.phase = "playing";
        state.busy = false;
        rerender();
    };

    root.append(
        h("header", { class: "top" },
            h("h1", { text: "Counterfeit" }),
            h("p", { class: "tagline", text: "One of these is a machine. Spot it before the clock runs out." }),
        ),
        h("section", { class: "panel" },
            h("h2", { class: "legend", text: "What are you judging?" }),
            h("div", { class: "seg", role: "group", "aria-label": "Round type" },
                ...MODES.map((mode: Mode) =>
                    chip(
                        mode === "image" ? "Pictures" : mode === "caption" ? "Paragraphs" : "Both",
                        state.settings.mode === mode,
                        "data-mode",
                        mode,
                        () => apply({ mode }),
                    ),
                ),
            ),
            h("h2", { class: "legend", text: "How hard?" }),
            h("div", { class: "seg", role: "group", "aria-label": "Difficulty" },
                ...(["all", ...TIERS] as (Tier | "all")[]).map((tier) =>
                    chip(
                        tierLabel(tier),
                        state.settings.tier === tier,
                        "data-tier",
                        tier,
                        () => apply({ tier }),
                    ),
                ),
            ),
            h("label", { class: "switch" },
                h("input", {
                    type: "checkbox",
                    "data-fresh": "true",
                    checked: state.settings.fresh ? "checked" : undefined,
                    onchange: (event: Event) =>
                        apply({ fresh: (event.target as HTMLInputElement).checked }),
                }),
                h("span", {},
                    h("strong", { text: "Fresh fakes" }),
                    h("em", {
                        text: "Let Pollinations draw the AI picture as you play, instead of using the stored copy.",
                    }),
                ),
            ),
            button("Start", start, "primary", ROUNDS.length === 0),
        ),
        h("section", { class: "stats" },
            h("div", {},
                h("span", { class: "num", text: String(ROUNDS.length) }),
                h("span", { class: "cap", text: "rounds ready" }),
            ),
            h("div", {},
                h("span", { class: "num", text: String(state.best) }),
                h("span", { class: "cap", text: "best streak" }),
            ),
        ),
        h("section", { class: "about" },
            h("h2", { class: "legend", text: "How it works" }),
            h("p", {
                text: "Every picture round pairs a real photograph from Wikimedia Commons with an AI twin generated by Pollinations. Every paragraph round pairs a Wikipedia lead with a model-written one. The fake is always generated ahead of time, so nobody has to sign in to play.",
            }),
            h("p", {},
                "Source code and round data live in the ",
                h("a", {
                    href: "https://github.com/kreggscode/counterfeit",
                    rel: "noreferrer",
                    text: "counterfeit repository",
                }),
                ". Images come from ",
                h("a", { href: "https://commons.wikimedia.org", rel: "noreferrer", text: "Wikimedia Commons" }),
                " and are credited in every reveal; fakes come from ",
                h("a", { href: "https://pollinations.ai", rel: "noreferrer", text: "Pollinations" }),
                ".",
            ),
        ),
    );
};

/* --------------------------------------------------------------- playing */

const renderPlaying = (root: HTMLElement, state: State, rerender: () => void) => {
    const matchup = current(state);
    if (!matchup) {
        state.phase = "summary";
        rerender();
        return;
    }

    const { round } = matchup;
    const totalMs = ROUND_MS[round.kind];
    state.totalMs = totalMs;
    state.deadline = Date.now() + totalMs;

    const tile = (side: Side): HTMLButtonElement => {
        const live = isFake(matchup, side) && state.settings.fresh && round.kind === "image"
            ? liveImage(round.fake.prompt, seedFor(round.id))
            : null;

        const body: HTMLElement =
            round.kind === "image"
                ? pictureFrame(side, picture(matchup, side), live)
                : h("blockquote", { class: "prose", text: caption(matchup, side) });

        return h(
            "button",
            {
                class: "tile",
                type: "button",
                "data-side": side,
                "data-answer": isFake(matchup, side) ? "fake" : "real",
                "aria-label": `Side ${side.toUpperCase()}`,
                onclick: () => commit(state, side, rerender),
            },
            h("span", { class: "letter", text: side.toUpperCase() }),
            body,
        );
    };

    const bar = h("i", { class: "bar", "data-clock": "true" });
    const label = h("span", { class: "clock", "data-clock-text": "true", text: `${Math.round(totalMs / 1000)}s` });

    root.append(
        h("header", { class: "hud" },
            h("span", { class: "hud-item", text: `Round ${state.index + 1} of ${state.queue.length}` }),
            h("span", { class: "hud-item", "data-score": String(state.points), text: `${state.points} pts` }),
            h("span", { class: "hud-item", "data-streak": String(state.streak), text: `streak ${state.streak}` }),
        ),
        h("div", { class: "timer" }, bar, label),
        h("p", { class: "prompt", text: round.kind === "image" ? "Which one is the fake?" : "Which paragraph is machine-written?" }),
        h("div", { class: "duel" }, tile("a"), tile("b")),
        h("p", { class: "tier-note", text: `${tierLabel(round.tier)} round · ${round.kind === "image" ? "image" : "text"}` }),
    );

    stopClock();
    clock = window.setInterval(() => {
        const left = state.deadline - Date.now();
        if (left <= 0) {
            stopClock();
            commit(state, null, rerender);
            return;
        }
        const ratio = Math.max(0, Math.min(1, left / totalMs));
        bar.style.width = `${ratio * 100}%`;
        bar.classList.toggle("warn", ratio < 0.34);
        label.textContent = `${Math.ceil(left / 1000)}s`;
    }, 100);
};

/* ---------------------------------------------------------------- reveal */

const renderReveal = (root: HTMLElement, state: State, rerender: () => void) => {
    const matchup = current(state);
    const last = state.last;
    if (!matchup || !last) {
        state.phase = "summary";
        rerender();
        return;
    }

    const { round } = matchup;
    const verdictWord =
        last.verdict === "correct" ? "Got it" : last.verdict === "timeout" ? "Out of time" : "Not that one";
    const fakeSide = matchup.fakeOn;

    // Both halves of the pair are explained: what Pollinations drew or wrote,
    // and where the genuine counterpart came from.
    const provenance: HTMLElement =
        round.kind === "image"
            ? h("p", { class: "prov" },
                  h("strong", { text: "The fake" }),
                  ` — drawn by Pollinations with ${round.fake.model}.`,
                  h("br"),
                  h("code", { class: "prompt-text", text: round.fake.prompt }),
              )
            : h("p", { class: "prov" },
                  h("strong", { text: "The fake" }),
                  ` — written by ${round.fake.model} in the register of an encyclopaedia.`,
              );

    const other: HTMLElement =
        round.kind === "image"
            ? h("p", { class: "prov muted" },
                  h("strong", { text: "The real one" }),
                  " — ",
                  h("a", { href: round.real.page, rel: "noreferrer", text: round.real.title }),
                  `, by ${round.real.author} (${round.real.licence}), via Wikimedia Commons.`,
              )
            : h("p", { class: "prov muted" },
                  h("strong", { text: "The real one" }),
                  " — the opening of the ",
                  h("a", { href: round.real.page, rel: "noreferrer", text: round.real.source }),
                  " article.",
              );

    const next = () => {
        if (state.busy) return;
        state.busy = true;
        state.index += 1;
        state.picked = null;
        state.last = null;
        state.phase = state.index >= state.queue.length ? "summary" : "playing";
        state.busy = false;
        rerender();
    };

    root.append(
        h("section", {
            class: `reveal ${last.verdict}`,
            "data-verdict": last.verdict,
            "data-answer": fakeSide,
        },
            h("h2", { text: verdictWord }),
            h("p", {
                class: "answer-line",
                text: `The AI was side ${fakeSide.toUpperCase()}. ${
                    last.points > 0 ? `+${last.points} points.` : "No points."
                }`,
            }),
            provenance,
            other,
            h("p", { class: "tell" },
                h("strong", { text: "What gave it away" }),
                h("span", { text: round.tell }),
            ),
            h("div", { class: "reveal-foot" },
                h("span", { class: "streak-chip", "data-streak": String(state.streak), text: `streak ${state.streak}` }),
                button("Next", next, "primary"),
            ),
        ),
    );
};

/* --------------------------------------------------------------- summary */

const renderSummary = (root: HTMLElement, state: State, rerender: () => void) => {
    const totals = summarise(state.results);
    const pct = totals.total > 0 ? Math.round((totals.correct / totals.total) * 100) : 0;
    const verdict = pct >= 80 ? "Sharp eyes" : pct >= 50 ? "Half and half" : "The machines win this round";

    if (totals.bestStreak > state.best) {
        state.best = totals.bestStreak;
        writeNumber(BEST_STREAK_KEY, state.best);
    }

    const again = () => {
        if (state.busy) return;
        state.busy = true;
        const chosen = selectRounds(ROUNDS, state.settings.mode, state.settings.tier);
        state.queue = chosen.length > 0 ? deal(chosen) : state.queue;
        state.index = 0;
        state.results = [];
        state.streak = 0;
        state.points = 0;
        state.last = null;
        state.picked = null;
        state.phase = "playing";
        state.busy = false;
        rerender();
    };

    const home = () => {
        if (state.busy) return;
        state.busy = true;
        state.phase = "home";
        state.busy = false;
        rerender();
    };

    root.append(
        h("section", { class: "summary" },
            h("h2", { text: verdict }),
            h("p", { class: "big", "data-score": String(totals.points), text: `${totals.points} points` }),
            h("div", { class: "grid" },
                h("div", {},
                    h("span", { class: "num", text: `${totals.correct}/${totals.total}` }),
                    h("span", { class: "cap", text: "correct" }),
                ),
                h("div", {},
                    h("span", { class: "num", text: String(pct) + "%" }),
                    h("span", { class: "cap", text: "accuracy" }),
                ),
                h("div", {},
                    h("span", { class: "num", "data-streak": String(totals.bestStreak), text: String(totals.bestStreak) }),
                    h("span", { class: "cap", text: "best streak" }),
                ),
            ),
            h("div", { class: "actions" },
                button("Play again", again, "primary"),
                button("Change settings", home, "ghost"),
            ),
            h("p", { class: "fine", text: `Lifetime best streak: ${state.best}` }),
        ),
    );
};

/* ---------------------------------------------------------------- commit */

const commit = (state: State, picked: Side | null, rerender: () => void) => {
    if (state.phase !== "playing" || state.busy) return;
    const matchup = current(state);
    if (!matchup) return;

    state.busy = true;
    stopClock();
    const remaining = Math.max(0, state.deadline - Date.now());
    const outcome = answer(matchup, picked, remaining, state.totalMs, state.streak);

    state.picked = picked;
    state.last = outcome;
    state.streak = outcome.streak;
    state.points += outcome.points;
    state.results.push({
        id: matchup.round.id,
        verdict: outcome.verdict,
        points: outcome.points,
        streak: outcome.streak,
    });
    state.phase = "reveal";
    state.busy = false;
    rerender();
};

/* ------------------------------------------------------------------ boot */

export const boot = () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) return;

    const settings = readSettings();
    const state = freshState(settings);

    const rerender = () => {
        stopClock();
        clear(root);
        root.dataset.phase = state.phase;
        root.dataset.settled = String(settled);
        if (state.phase === "home") renderHome(root, state, rerender);
        else if (state.phase === "playing") renderPlaying(root, state, rerender);
        else if (state.phase === "reveal") renderReveal(root, state, rerender);
        else renderSummary(root, state, rerender);
        bump(root);
    };

    document.title = "Counterfeit — spot the fake";
    rerender();
};


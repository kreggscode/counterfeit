# Counterfeit

**Spot the fake.** Two pictures or two paragraphs appear side by side, one of them
was made by a machine, and the clock is already running.

Play it at **https://kreggscode.github.io/counterfeit/**

Counterfeit was built for [Pollinations quest #15725](https://github.com/pollinations/pollinations/issues/15725).

## How to play

1. Pick what you are judging — **Pictures**, **Paragraphs**, or **Both** — and how hard:
   **Easy**, **Medium**, **Hard**, or **All**.
2. Hit **Start**. Two tiles appear with a timer bar running across the top.
3. Click the one you think is AI before time runs out.
4. The reveal tells you which side was fake, where the real one came from, who
   licensed it, what prompt the generator was given, and what actually gave it away.
5. Correct answers score 10 points plus up to 10 more for speed, and consecutive
   hits build a streak. Your best streak is remembered on your own device.

Nothing to install, nothing to sign up for.

## The rounds

| | |
| --- | --- |
| 12 picture rounds | a real photograph from **Wikimedia Commons** paired with an AI twin |
| 6 paragraph rounds | a **Wikipedia** lead paired with a model-written one |
| 6 rounds per difficulty | easy, medium and hard, one third each |

**The real side.** Photographs are pulled from Wikimedia Commons during round
authoring and kept in `public/reals/`. Every one is credited in its reveal with
the file, the author and the licence, and links back to the Commons file page.
Only permissive licences are accepted — CC0, CC BY, CC BY-SA and public domain —
and anything that turns out to be a generated image itself is rejected.

**The fake side.** Fakes are drawn by [Pollinations](https://pollinations.ai) with
three different image models, so difficulty tracks how good the generator is:

| Tier | Model |
| --- | --- |
| easy | `lykon/dreamshaper-8-lcm` |
| medium | `black-forest-labs/flux.1-schnell` |
| hard | `bytedance/seedream-5.0-pro` |

They are generated ahead of time and committed under `public/fakes/`, which is why
anyone can play without an account.

**Fresh fakes.** The toggle on the setup screen is on by default. When it is on,
the AI tile is drawn live from `image.pollinations.ai` as the round starts, so you
are judging something the model made a moment ago rather than a stored copy. That
endpoint is keyless by design, so the browser is never handed a token. If the live
request fails, the tile says so and the round falls back to the stored file — the
fallback is announced rather than hidden, so a broken live path cannot pass
unnoticed.

## How the data was made

`scripts/author.mjs` is the whole pipeline. It searches Commons for a subject,
records the credit, asks Pollinations for the matching twin, downloads both, pulls
the Wikipedia lead for the paragraph rounds, writes the AI paragraphs, and emits
`src/rounds.json`.

```bash
POLLINATIONS_API_KEY=sk_... node scripts/author.mjs
```

It is a one-off tool: nothing in the app calls it, it is not part of the build,
and no key is written to the repository.

## Building it

```bash
npm install
npm run lint      # type-check
npm test          # unit tests, including two live probes
npm run build     # type-check + bundle
npm run preview   # serve the build at /counterfeit/
```

E2E tests against the local preview:

```bash
npx playwright test
```

The same specs pointed at the deployed app:

```bash
E2E_BASE_URL=https://kreggscode.github.io/counterfeit/ npx playwright test
```

Screenshots in [`evidence/`](evidence/) are regenerated with
`npm run build && node scripts/evidence.mjs`.

## Layout

```
src/rounds.ts     round types, validation, dealing, which side is fake
src/game.ts       scoring, streaks, settings, storage
src/api.ts        the one live Pollinations call
src/app.ts        screens and the round loop
src/rounds.json   18 authored rounds
scripts/          round authoring and screenshot capture
e2e/              Playwright specs
```

## Credits

Real photographs come from [Wikimedia Commons](https://commons.wikimedia.org) and
are individually credited in every reveal. Fake images and paragraphs come from
[Pollinations](https://pollinations.ai). Wikipedia text is from
[Wikipedia](https://www.wikipedia.org) under CC BY-SA.

## Licence

MIT — see [LICENSE](LICENSE).

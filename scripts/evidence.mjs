/**
 * One-off: capture the screenshots committed under evidence/.
 *
 * Run `npm run build` first, then `node scripts/evidence.mjs`.
 */

import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const PORT = 4178;
const BASE = `http://127.0.0.1:${PORT}/counterfeit/`;
const OUT = new URL("../evidence/", import.meta.url);

const shot = (name) => fileURLToPath(new URL(name, OUT));

const ready = async (url, tries = 60) => {
    for (let i = 0; i < tries; i += 1) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            /* server not up yet */
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`preview never came up at ${url}`);
};

const main = async () => {
    await rm(OUT, { recursive: true, force: true });
    await mkdir(OUT, { recursive: true });

    const server = spawn(
        "npm",
        ["run", "preview", "--", "--port", String(PORT), "--host", "127.0.0.1"],
        { shell: true, stdio: "ignore" },
    );

    const browser = await chromium.launch();
    try {
        await ready(BASE);
        const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
        await page.addInitScript(() => window.localStorage.clear());

        // 1 — setup
        await page.goto(BASE);
        await page.locator("#app[data-phase=home]").waitFor();
        await page.screenshot({ path: shot("01-setup.png"), fullPage: true });

        // 2 — a picture round in play (stored fakes, so this is quick)
        await page.locator("input[data-fresh]").uncheck();
        await page.getByRole("button", { name: "Start" }).click();
        await page.locator(".frame.ready").first().waitFor({ timeout: 60_000 });
        await page.screenshot({ path: shot("02-picture-round.png"), fullPage: true });

        // 3 — the reveal, with provenance and the tell
        await page.locator('.tile[data-answer="fake"]').click();
        await page.locator("#app[data-phase=reveal]").waitFor();
        await page.screenshot({ path: shot("03-reveal.png"), fullPage: true });

        // 4 — a paragraph round
        await page.goto(BASE);
        await page.locator("#app[data-phase=home]").waitFor();
        await page.locator('[data-mode="caption"]').click();
        await page.locator('[data-tier="easy"]').click();
        await page.getByRole("button", { name: "Start" }).click();
        await page.locator(".prose").first().waitFor();
        await page.screenshot({ path: shot("04-paragraph-round.png"), fullPage: true });

        // 5 — play the short run out to the totals
        for (let i = 0; i < 12; i += 1) {
            const phase = await page.locator("#app").getAttribute("data-phase");
            if (phase === "summary") break;
            if (phase === "playing") await page.locator('.tile[data-answer="fake"]').click();
            else if (phase === "reveal") await page.getByRole("button", { name: "Next" }).click();
            await page.waitForTimeout(120);
        }
        await page.locator("#app[data-phase=summary]").waitFor({ timeout: 30_000 });
        await page.screenshot({ path: shot("05-summary.png"), fullPage: true });

        // 6 — fresh fakes, so the Pollinations request is on screen
        await page.goto(BASE);
        await page.locator("#app[data-phase=home]").waitFor();
        await page.getByRole("button", { name: "Start" }).click();
        await page.locator('.tile[data-answer="fake"] img[data-live]').waitFor({ timeout: 30_000 });
        await page.screenshot({ path: shot("06-fresh-fake.png"), fullPage: true });

        console.log("evidence written");
    } finally {
        await browser.close();
        server.kill();
    }
};

await main();

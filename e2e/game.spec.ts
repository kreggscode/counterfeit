import { expect, test, type Page } from "@playwright/test";

/** Wait until the current screen has finished rendering. */
const settled = async (page: Page, phase: string) => {
    await expect(page.locator(`#app[data-phase="${phase}"]`)).toBeAttached({ timeout: 30_000 });
};

const start = async (page: Page) => {
    await page.getByRole("button", { name: "Start" }).click();
    await settled(page, "playing");
};

const pick = async (page: Page, side: "fake" | "real") => {
    await page.locator(`.tile[data-answer="${side}"]`).click();
    await settled(page, "reveal");
};

/** Turn the live Pollinations fetch off unless a test is specifically about it. */
const setFresh = async (page: Page, fresh: boolean) => {
    const box = page.locator('input[data-fresh]');
    if ((await box.isChecked()) !== fresh) await box.click();
};

test("sets up a run without asking anyone to sign in", async ({ page }) => {
    await page.goto("./");
    await settled(page, "home");

    await expect(page.locator("h1")).toHaveText("Counterfeit");
    await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
    await expect(page.getByRole("group", { name: "Round type" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Difficulty" })).toBeVisible();
    await expect(page.locator(".stats")).toContainText("18");
    await expect(page.locator(".about")).toContainText("Wikimedia Commons");
    await expect(page.locator(".about")).toContainText("Pollinations");
    await expect(page.locator(".about")).toContainText("nobody has to sign in");
    // Nothing in the setup asks for an account or an API key.
    await expect(page.locator("input[type=password], input[type=email]")).toHaveCount(0);
});

test("scores a correct guess and credits the photograph", async ({ page }) => {
    await page.goto("./");
    await settled(page, "home");
    await setFresh(page, false);
    await start(page);

    await expect(page.locator(".prompt")).toContainText("Which one is the fake?");
    await expect(page.locator(".frame.ready").first()).toBeAttached({ timeout: 60_000 });

    await pick(page, "fake");

    const reveal = page.locator(".reveal");
    await expect(reveal).toHaveAttribute("data-verdict", "correct");
    await expect(reveal).toContainText("The AI was side");
    await expect(reveal).toContainText("+");
    await expect(reveal.locator(".tell")).toContainText("What gave it away");
    await expect(reveal).toContainText("drawn by Pollinations");
    await expect(reveal).toContainText("Wikimedia Commons");
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
});

test("charges a guess that lands on the real photograph", async ({ page }) => {
    await page.goto("./");
    await settled(page, "home");
    await setFresh(page, false);
    await start(page);
    await expect(page.locator(".frame.ready").first()).toBeAttached({ timeout: 60_000 });

    await pick(page, "real");

    await expect(page.locator(".reveal")).toHaveAttribute("data-verdict", "wrong");
    await expect(page.locator(".reveal")).toContainText("No points.");
});

test("draws the fake with Pollinations when fresh fakes are on", async ({ page }) => {
    await page.goto("./");
    await settled(page, "home");
    await expect(page.locator('input[data-fresh]')).toBeChecked();
    await start(page);

    const live = page.locator('.tile[data-answer="fake"] img[data-live]');
    await expect(live).toHaveAttribute("src", /^https:\/\/image\.pollinations\.ai\/prompt\//);
    await expect(live).toHaveAttribute("src", /model=flux/);
    // No publishable key is ever handed to the browser.
    const src = (await live.getAttribute("src")) ?? "";
    expect(src).not.toMatch(/pk_|sk_|client_id/i);
});

test("falls back to the stored fake if the live request fails", async ({ page }) => {
    await page.route("**/image.pollinations.ai/**", (route) => route.abort());
    await page.goto("./");
    await settled(page, "home");
    await start(page);

    await expect(page.locator(".frame.ready").first()).toBeAttached({ timeout: 60_000 });
    await expect
        .poll(async () => (await page.locator('.tile[data-answer="fake"] img').getAttribute("src")) ?? "")
        .toContain("/counterfeit/fakes/");
    await expect(page.locator(".tile").first()).toBeEnabled();
});

test("plays a paragraph round and credits Wikipedia", async ({ page }) => {
    await page.goto("./");
    await settled(page, "home");
    await page.locator('[data-mode="caption"]').click();
    await expect(page.locator('[data-mode="caption"]')).toHaveAttribute("aria-pressed", "true");
    await start(page);

    await expect(page.locator(".prompt")).toContainText("machine-written");
    const left = await page.locator(".tile[data-side='a'] .prose").innerText();
    const right = await page.locator(".tile[data-side='b'] .prose").innerText();
    expect(left.length).toBeGreaterThan(40);
    expect(right.length).toBeGreaterThan(40);
    expect(left).not.toBe(right);

    await pick(page, "fake");

    await expect(page.locator(".reveal .prov").first()).toContainText(/Wikipedia|written by/);
    await expect(page.locator(".reveal .tell")).toContainText("What gave it away");
});

test("runs out the clock and calls it a timeout", async ({ page }) => {
    await page.goto("./");
    await settled(page, "home");
    await setFresh(page, false);
    await start(page);

    await expect(page.locator(".reveal")).toBeAttached({ timeout: 45_000 });
    await expect(page.locator(".reveal")).toHaveAttribute("data-verdict", "timeout");
    await expect(page.locator(".reveal")).toContainText("Out of time");
});

test("finishes a short run and reports the totals", async ({ page }) => {
    await page.goto("./");
    await settled(page, "home");
    await page.locator('[data-mode="caption"]').click();
    await page.locator('[data-tier="easy"]').click();
    await start(page);

    await expect(page.locator(".hud-item").first()).toHaveText("Round 1 of 2");
    await pick(page, "fake");
    await page.getByRole("button", { name: "Next" }).click();
    await settled(page, "playing");
    await expect(page.locator(".hud-item").first()).toHaveText("Round 2 of 2");
    await pick(page, "real");
    await page.getByRole("button", { name: "Next" }).click();

    await settled(page, "summary");
    await expect(page.locator(".summary .big")).toContainText("points");
    await expect(page.locator(".summary .grid")).toContainText("1/2");
    await expect(page.getByRole("button", { name: "Play again" })).toBeEnabled();

    await page.getByRole("button", { name: "Play again" }).click();
    await settled(page, "playing");
    await expect(page.locator(".hud-item").first()).toHaveText("Round 1 of 2");
});

test("keeps the difficulty and mode choices between screens", async ({ page }) => {
    await page.goto("./");
    await settled(page, "home");
    await page.locator('[data-tier="hard"]').click();
    await page.locator('[data-mode="mixed"]').click();
    await expect(page.locator('[data-tier="hard"]')).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await settled(page, "home");
    await expect(page.locator('[data-tier="hard"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-mode="mixed"]')).toHaveAttribute("aria-pressed", "true");
});

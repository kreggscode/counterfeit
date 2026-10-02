import { describe, expect, it } from "vitest";
import {
    COMMONS_API,
    IMAGE_ENDPOINT,
    commonsQuery,
    liveImage,
    probeCommonsCors,
    probeLiveImage,
    seedFor,
} from "./api.js";

describe("liveImage", () => {
    it("points at the keyless image endpoint", () => {
        const url = liveImage("a red fox curled up in fresh snow", 42);
        expect(url.startsWith(IMAGE_ENDPOINT)).toBe(true);
        expect(url).toContain("a%20red%20fox");
        expect(url).toContain("seed=42");
        expect(url).toContain("nologo=true");
        expect(url).not.toMatch(/[?&](token|key|api_key)=/i);
    });

    it("does not pin a model the endpoint may no longer list", () => {
        expect(liveImage("a fox", 1)).not.toContain("model=");
    });

    it("keeps the prompt readable in the query", () => {
        expect(liveImage("strawberry tart on a plate, 85mm", 1)).toContain(
            encodeURIComponent("strawberry tart on a plate, 85mm"),
        );
    });
});

describe("seedFor", () => {
    it("gives the same round the same seed", () => {
        expect(seedFor("fox")).toBe(seedFor("fox"));
        expect(seedFor("fox")).not.toBe(seedFor("owl"));
    });

    it("stays inside the range the endpoint accepts", () => {
        for (const id of ["fox", "tart", "lighthouse", "village", "tectonics"]) {
            const seed = seedFor(id);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThan(1_000_000);
        }
    });
});

describe("pollinations image endpoint", () => {
    it("draws a fresh fake without asking anyone to sign in", async () => {
        const { status, type } = await probeLiveImage(
            "photograph of a red fox curled up in fresh snow, natural light",
            42,
        );
        expect(status).toBe(200);
        expect(type).toMatch(/^image\//);
    }, 120_000);
});

describe("wikimedia commons", () => {
    it("answers cross-origin requests, which is how the app reads it", async () => {
        const { status, cors } = await probeCommonsCors();
        expect(status).toBe(200);
        expect(cors).toContain("*");
        expect(commonsQuery()).toContain("origin=*");
        expect(COMMONS_API).toContain("commons.wikimedia.org");
    }, 30_000);
});

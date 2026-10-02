/**
 * The one place the app reaches out to Pollinations at runtime.
 *
 * Everything else in Counterfeit plays offline from committed round data;
 * this is for the optional "fresh fake" mode, which draws a brand new twin the
 * moment you start a round. The endpoint is keyless by design, so there is no
 * token to leak and no sign-in to sit in front of the game.
 */

export const IMAGE_ENDPOINT = "https://image.pollinations.ai/prompt/";

/** Model the live endpoint is known to accept. */
export const LIVE_MODEL = "flux";

export type Fetcher = (input: string, init?: { headers?: Record<string, string> }) => Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    arrayBuffer(): Promise<ArrayBuffer>;
}>;

export const liveImage = (prompt: string, seed: number): string => {
    const query = new URLSearchParams({
        width: "832",
        height: "832",
        nologo: "true",
        model: LIVE_MODEL,
        seed: String(seed),
    });
    return `${IMAGE_ENDPOINT}${encodeURIComponent(prompt)}?${query}`;
};

/** Deterministic seed so a round can be re-requested during tests. */
export const seedFor = (id: string): number => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return hash % 1_000_000;
};

export const probeLiveImage = async (
    prompt: string,
    seed: number,
    fetcher: Fetcher = fetch,
): Promise<{ status: number; type: string }> => {
    const response = await fetcher(liveImage(prompt, seed));
    const type = response.headers.get("content-type") ?? "";
    // Drain the body so the connection closes cleanly in CI.
    if (response.ok) await response.arrayBuffer();
    return { status: response.status, type };
};

/** Wikimedia's API sends this header when the query carries `origin=*`. */
export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

export const commonsQuery = (): string =>
    `${COMMONS_API}?action=query&meta=siteinfo&format=json&origin=*`;

export const probeCommonsCors = async (
    fetcher: Fetcher = fetch,
): Promise<{ status: number; cors: string }> => {
    const response = await fetcher(commonsQuery(), {
        headers: { Origin: "https://example.test" },
    });
    return { status: response.status, cors: response.headers.get("access-control-allow-origin") ?? "" };
};

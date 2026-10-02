/**
 * One-off round authoring for Counterfeit.
 *
 * Sources a real photograph from Wikimedia Commons, generates an AI twin with a
 * Pollinations image model, and writes both into src/rounds.json. Caption rounds
 * pair a Wikipedia lead (human-written) with a model-written paragraph on the
 * same subject.
 *
 * Run once: POLLINATIONS_API_KEY=sk_... node scripts/author.mjs
 * Nothing here runs in CI, and no key is written to the repo.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const KEY = process.env.POLLINATIONS_API_KEY;
if (!KEY) {
    console.error("POLLINATIONS_API_KEY is required");
    process.exit(1);
}

const GEN = "https://gen.pollinations.ai";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const OUT = new URL("../src/rounds.json", import.meta.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wikimedia asks for a descriptive User-Agent and throttles anonymous bursts.
const COMMONS_UA = "Counterfeit/1.0 (Pollinations app round authoring)";

const TIERS = ["easy", "medium", "hard"];

/** One tier per realism level: simpler detail first, flagship photorealism last. */
const MODEL = {
    easy: "lykon/dreamshaper-8-lcm",
    medium: "black-forest-labs/flux.1-schnell",
    hard: "bytedance/seedream-5.0-pro",
};

const IMAGES = [
    { id: "fox", file: "Red fox resting in snow (31695215684).jpg", search: "red fox snow", subject: "a red fox curled up in fresh snow", tier: "easy", tell: "Fur is where generators still blur: a camera resolves individual hairs, the render melts them into a single mass." },
    { id: "tart", search: "strawberry tart pastry", subject: "a strawberry tart on a ceramic plate", tier: "easy", tell: "Count the seeds. Generators place strawberry achenes evenly instead of in the irregular spiral a real berry has." },
    { id: "lighthouse", file: "Lighthouse at Sunset (28336073934).jpg", search: "lighthouse sunset sea rocks", subject: "a lighthouse on black rocks at sunset", tier: "easy", tell: "The horizon is the tell — generated sunsets tend to smear the sea and sky into one continuous glow." },
    { id: "balloon", file: "Balloons In Flight (117949135).jpeg", search: "hot air balloons sky", subject: "hot air balloons rising over a valley at dawn", tier: "easy", tell: "Rope and basket rigging rarely resolves. Real balloons have a visible web of lines; the render approximates it." },

    { id: "kingfisher", search: "common kingfisher perched branch", subject: "a kingfisher perched on a bare branch", tier: "medium", tell: "Look at the branch. Generated perches often float, taper wrongly, or pass behind the bird twice." },
    { id: "turtle", file: "Chelonia mydas swimming, Hawaii.jpg", search: "green sea turtle coral reef", subject: "a green sea turtle gliding over coral", tier: "medium", tell: "The shell pattern is the giveaway: scutes repeat with a symmetry nature never quite manages." },
    { id: "path", search: "autumn forest path leaves", subject: "an autumn forest path covered in leaves", tier: "medium", tell: "Leaves on the ground get invented at a consistent scale. Real leaf litter is chaotic in size and orientation." },
    { id: "village", file: "Matterhorn in winter with Zermatt village.jpg", search: "alpine village snow winter", subject: "a snow-covered alpine village beneath a jagged mountain peak", tier: "medium", tell: "Windows are the weakness. Generated buildings light them in patterns that do not correspond to any interior." },

    { id: "owl", search: "great horned owl portrait", subject: "a great horned owl facing the camera", tier: "hard", tell: "Both eyes should share one focal plane. Generated faces often sharpen one and soften the other." },
    { id: "horses", file: "Wild horses running across the landsacpe (53889283010).jpg", search: "wild horses running", subject: "wild horses running across an open plain", tier: "hard", tell: "Count legs against shadows. Motion is still where anatomy and ground contact drift apart." },
    { id: "reef", search: "coral reef fish school", subject: "a school of fish over a coral reef", tier: "hard", tell: "The fish repeat. Generators tile a small set of individuals rather than render a hundred distinct ones." },
    { id: "lake", search: "mountain lake reflection snow", subject: "a mountain lake reflecting snowy peaks", tier: "hard", tell: "Reflections should be a mirrored inversion. Generated ones are close, but the ridge line rarely matches exactly." },
];

const CAPTIONS = [
    { id: "axolotl", title: "Axolotl", subject: "the axolotl", tier: "easy", tell: "The real one opens with a dated species description; the generated one starts with a hook and never dates anything." },
    { id: "sourdough", title: "Sourdough", subject: "sourdough bread", tier: "easy", tell: "Watch for a closing sentence that summarises. Human encyclopaedic prose rarely signs off, generated prose often does." },
    { id: "aurora", title: "Aurora", subject: "the aurora borealis", tier: "medium", tell: "Both read cleanly, so the tell is precision: the real paragraph commits to specific altitudes and particle names." },
    { id: "baobab", title: "Adansonia", subject: "the baobab tree", tier: "medium", tell: "The generated paragraph uses more hedges — 'often', 'generally', 'is known for' — where the human text states facts flatly." },
    { id: "voyager", title: "Voyager 1", subject: "the Voyager 1 spacecraft", tier: "hard", tell: "Numbers separate them: the real text is dense with dates, distances and instrument names that can be checked." },
    { id: "tectonics", title: "Plate tectonics", subject: "plate tectonics", tier: "hard", tell: "Both are neutral and correct. The tell is sentence rhythm — generated prose keeps an even beat, human prose varies." },
];

const acceptableLicence = (licence) =>
    /cc0|cc[ -]by(?!-nc)|public domain|\bpd\b/i.test(licence ?? "");

// Commons also hosts generated images; those would make a round unplayable.
const looksGenerated = (author, title) =>
    /microsoft bing|dall[·\- ]?e|midjourney|stable diffusion|ai[- ]generated|generated with/i.test(
        `${author} ${title}`,
    );

const stripTags = (html) =>
    String(html ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const normalise = (page) => {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    const entry = {
        title: String(page.title ?? "").replace(/^File:/, ""),
        thumb: info?.thumburl,
        page: info?.descriptionurl,
        author: stripTags(meta.Artist?.value) || "Unknown",
        licence: stripTags(meta.LicenseShortName?.value) || "Unknown",
    };
    return entry;
};

const queryCommons = async (params) => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await fetch(`${COMMONS}?${params}`, {
            headers: { "User-Agent": COMMONS_UA },
        });
        if (response.status === 429 || response.status >= 500) {
            await sleep(attempt * 3000);
            continue;
        }
        if (!response.ok) throw new Error(`commons query failed: ${response.status}`);
        const payload = await response.json();
        await sleep(1200);
        return Object.values(payload.query?.pages ?? {}).map(normalise);
    }
    throw new Error("commons query kept being rate limited");
};

const searchCommons = async (terms) => {
    const params = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: `filetype:bitmap ${terms}`,
        gsrnamespace: "6",
        gsrlimit: "12",
        prop: "imageinfo",
        iiprop: "url|extmetadata",
        iiurlwidth: "1000",
        format: "json",
        origin: "*",
    });
    const pages = await queryCommons(params);
    return pages.filter(
        (entry) =>
            entry.thumb &&
            /\.(jpe?g|png)$/i.test(entry.title) &&
            acceptableLicence(entry.licence) &&
            !looksGenerated(entry.author, entry.title),
    );
};

/** Pull one exact file by name when search relevance is poor. */
const commonsFile = async (file) => {
    const params = new URLSearchParams({
        action: "query",
        titles: `File:${file}`,
        prop: "imageinfo",
        iiprop: "url|extmetadata",
        iiurlwidth: "1000",
        format: "json",
        origin: "*",
    });
    const pages = await queryCommons(params);
    const entry = pages[0];
    if (!entry?.thumb) throw new Error(`commons has no thumb for ${file}`);
    if (!acceptableLicence(entry.licence)) throw new Error(`${file} licence not usable: ${entry.licence}`);
    if (looksGenerated(entry.author, entry.title)) throw new Error(`${file} is a generated image`);
    return entry;
};

const generateImage = async (prompt, model) => {
    const response = await fetch(`${GEN}/v1/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model, size: "1024x1024", n: 1, response_format: "url" }),
    });
    if (!response.ok) throw new Error(`generate failed: ${response.status} ${await response.text()}`);
    const payload = await response.json();
    const url = payload.data?.[0]?.url;
    if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("no image url");
    return url;
};

const generateText = async (system, user) => {
    const response = await fetch(`${GEN}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "openai/gpt-5.4-nano",
            temperature: 0.9,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
        }),
    });
    if (!response.ok) throw new Error(`text failed: ${response.status}`);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("empty text");
    return content.trim();
};

const download = async (url, destination) => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await fetch(url, { headers: { "User-Agent": COMMONS_UA } });
        if (response.status === 429 || response.status >= 500) {
            await sleep(attempt * 3000);
            continue;
        }
        if (!response.ok) throw new Error(`download failed: ${response.status}`);
        await writeFile(destination, Buffer.from(await response.arrayBuffer()));
        return;
    }
    throw new Error("download kept being rate limited");
};

const wikipediaLead = async (topic) => {
    const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
        { headers: { "User-Agent": "counterfeit-game/1.0 (app authoring)" } },
    );
    if (!response.ok) throw new Error(`wikipedia failed: ${response.status}`);
    const payload = await response.json();
    if (typeof payload.extract !== "string") throw new Error("no extract");
    return payload.extract;
};

const captionSystem = (tier) =>
    tier === "hard"
        ? `You write short neutral encyclopaedia prose. Reply with ONE paragraph of 45 to 70 words on the subject you are given. Use the register of a mature encyclopaedia: no opening hook, no summary sentence, no second person, no marketing tone. Plain factual sentences only. Reply with the paragraph and nothing else.`
        : `You write short readable prose for a general reader. Reply with ONE paragraph of 45 to 70 words on the subject you are given. Friendly and clear, the way a good magazine explains something. Reply with the paragraph and nothing else.`;

/* ------------------------------------------------------------------ rounds */

const readExisting = async () => {
    try {
        const parsed = JSON.parse(await readFile(OUT, "utf8"));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const existing = await readExisting();
const byId = new Map(existing.map((round) => [round.id, round]));

await mkdir(new URL("../public/fakes/", import.meta.url), { recursive: true });
await mkdir(new URL("../public/reals/", import.meta.url), { recursive: true });

const imageRounds = [];
for (const [index, spec] of IMAGES.entries()) {
    process.stdout.write(`[${index + 1}/${IMAGES.length}] ${spec.id} … `);
    const fakeFile = new URL(`../public/fakes/${spec.id}.jpg`, import.meta.url);
    const match = spec.file ? await commonsFile(spec.file) : (await searchCommons(spec.search))[0];
    if (!match) {
        console.log("no commons match, skipped");
        continue;
    }
    const prompt = `photograph of ${spec.subject}, shot on a full-frame camera, natural light, 85mm lens, shallow depth of field, fine detail, no text, no watermark`;
    // Regenerating is a waste once the file is down; the prompt and model are derived from the spec.
    if (existsSync(fakeFile)) {
        process.stdout.write("cached");
    } else {
        const remote = await generateImage(prompt, MODEL[spec.tier]);
        await download(remote, fakeFile);
        process.stdout.write("generated");
    }
    // The real photograph is kept locally too, so a round never breaks if a CDN moves.
    await download(match.thumb, new URL(`../public/reals/${spec.id}.jpg`, import.meta.url));
    imageRounds.push({
        id: spec.id,
        kind: "image",
        subject: spec.subject,
        tier: spec.tier,
        real: {
            file: `reals/${spec.id}.jpg`,
            title: match.title,
            page: match.page,
            author: match.author,
            licence: match.licence,
        },
        fake: { file: `fakes/${spec.id}.jpg`, model: MODEL[spec.tier], prompt },
        tell: spec.tell,
    });
    console.log(" ok");
}

await writeFile(OUT, `${JSON.stringify(imageRounds, null, 2)}\n`, "utf8");

const captionRounds = [];
for (const [index, spec] of CAPTIONS.entries()) {
    process.stdout.write(`[${index + 1}/${CAPTIONS.length}] ${spec.id} … `);
    const cached = byId.get(spec.id);
    if (cached) {
        captionRounds.push(cached);
        console.log("cached");
        continue;
    }
    const lead = await wikipediaLead(spec.title);
    const written = await generateText(
        captionSystem(spec.tier),
        `Subject: ${spec.subject}. Write the paragraph now.`,
    );
    captionRounds.push({
        id: spec.id,
        kind: "caption",
        subject: spec.subject,
        tier: spec.tier,
        real: {
            text: lead,
            source: "Wikipedia",
            page: `https://en.wikipedia.org/wiki/${encodeURIComponent(spec.title.replace(/\s/g, "_"))}`,
        },
        fake: { text: written, model: "openai/gpt-5.4-nano" },
        tell: spec.tell,
    });
    console.log("ok");
}

const rounds = [...imageRounds, ...captionRounds];
await writeFile(OUT, `${JSON.stringify(rounds, null, 2)}\n`, "utf8");

console.log(`\n${imageRounds.length} image rounds, ${captionRounds.length} caption rounds`);
for (const tier of TIERS) {
    console.log(`  ${tier}: ${rounds.filter((round) => round.tier === tier).length}`);
}
console.log(`wrote src/rounds.json`);

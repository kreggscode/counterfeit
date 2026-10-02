import { defineConfig } from "vitest/config";

// Served from GitHub Pages at /counterfeit/.
export default defineConfig({
    base: "/counterfeit/",
    build: {
        outDir: "dist",
        sourcemap: false,
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});

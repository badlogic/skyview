#!/usr/bin/env node

import esbuild from "esbuild";

let watch = process.argv.length >= 3 && process.argv[2] == "--watch";

const config = {
    entryPoints: {
        server: "server.ts",
    },
    bundle: true,
    sourcemap: true,
    platform: "node",
    outdir: "build/",
    logLevel: "info",
    minify: !watch,
};

if (!watch) {
    console.log("Building site");
    await esbuild.build(config);
} else {
    const buildContext = await esbuild.context(config);
    buildContext.watch();
}

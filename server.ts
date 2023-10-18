import compression from "compression";
import express from "express";
import * as http from "http";
import * as fs from "fs";
import cors from "cors";
import { BskyBot, Events } from "easy-bsky-bot-sdk";
import { ViewType, loadThread } from "./bsky";

const port = process.env.PORT ?? 3333;
const blueskyAccount = process.env.SKYVIEW_BLUESKY_ACCOUNT!;
const blueskyKey = process.env.SKYVIEW_BLUESKY_PASSWORD!;

const indexTemplate = fs.readFileSync("index.html").toString();
if (!indexTemplate) {
    console.error("Couldn't read index.html");
    process.exit(-1);
}
const embedTemplate = fs.readFileSync("index.html").toString();
if (!embedTemplate) {
    console.error("Couldn't read embed.html");
    process.exit(-1);
}

console.log(`BlueSky account: ${blueskyAccount}`);
console.log(`BlueSky key: ${blueskyKey}`);

(async () => {
    BskyBot.setOwner({ handle: blueskyAccount, contact: "badlogicgames@gmail.com" });
    const bot = new BskyBot({ handle: blueskyAccount, replyToNonFollowers: true });
    try {
        await bot.login(blueskyKey);
        bot.setHandler(Events.MENTION, async (event) => {
            const { post } = event;
            const text = post.text.toLowerCase();
            const magicWords = ["unroll", "tree", "embed", "oida", "heast", "geh bitte", "es is ned olles schlecht in österreich"];
            if (magicWords.some((word) => text.includes(word))) {
                let viewType = "tree";
                if (text.includes("unroll")) viewType = "unroll";
                if (text.includes("embed")) viewType = "embed";
                console.log(`mentioned by @${post.author.handle}: ${post.text}`);
                await bot.reply(
                    `sure, here you go: \nhttps://skyview.social/?url=https://bsky.app/profile/${post.author.did}/post/${
                        post.uri.replace("at://", "").split("/")[2]
                    }&viewtype=${viewType}`,
                    post
                );
            }
        });
        bot.startPolling();
    } catch (e) {
        console.error("Couldn't log in.");
        process.exit(-1);
    }
    console.log("Bot is running");

    const app = express();
    app.use(cors());
    app.use(compression());

    const getMeta = async (url: string, originalUrl: string, viewType: ViewType): Promise<string> => {
        let meta = `
        <meta property="og:title" content="Skyview" />
        <meta property="og:type" content="website" />
        <meta property="og:description" content="Share BlueSky posts and threads externally" />
        <meta property="og:url" content="https://skyview.social" />
        <meta name="twitter:card" content="summary_large_image" />`;

        if (url) {
            const cacheKey = url + "|" + viewType;
            console.log("Generating meta for : " + cacheKey);
            if (metaCache.has(cacheKey)) {
                console.log("Using cached meta for " + cacheKey);
                meta = metaCache.get(cacheKey)!;
            } else {
                try {
                    const result = await loadThread(url, viewType);
                    if (typeof result != "string") {
                        const name = result.thread.post.author.displayName ?? result.thread.post.author.handle;
                        const title = `A BlueSky ${viewType == "embed" ? "post" : "thread"} by ${name} on Skyview`;
                        const text = result.thread.post.record.text;
                        const avatar = result.thread.post.author.avatar;
                        const url = "https://skyview.social" + originalUrl;
                        meta = `
                            <title>${title}</title>
                            <meta name="description" content="${text}">
                            <meta property="og:title" content="${title}" />
                            <meta property="og:type" content="article" />
                            <meta property="og:description" content="${text}" />
                            ${avatar ? `<meta property="og:image" content="${avatar}" />` : ""}
                            <meta property="og:url" content="${url}" />
                            <meta name="twitter:card" content="summary_large_image">
                            <meta property="twitter:domain" content="skyview.social">
                            <meta property="twitter:url" content="${url}">
                            <meta name="twitter:title" content="${title}">
                            <meta name="twitter:description" content="${text}">
                            ${avatar ? `<meta name="twitter:image" content="${avatar}">` : ""}
                        `;
                        console.log("Setting meta cache entry for " + cacheKey);
                        metaCache.set(cacheKey, meta);
                    }
                } catch (e) {
                    // no-op, we simply set no meta tags
                }
            }
        }
        return meta;
    };

    const metaCache = new Map<string, string>();
    app.get("/", async (req, res) => {
        res.setHeader("Content-Type", "text/html");
        const url = req.query.url as string;
        const viewType = (req.query.viewtype as ViewType) ?? "tree";
        res.status(200).send(indexTemplate.replace("<!-- meta -->", await getMeta(url, req.originalUrl, viewType)));
    });
    app.get("/embed.html", async (req, res) => {
        res.setHeader("Content-Type", "text/html");
        const url = req.query.url as string;
        const viewType = "embed";
        res.status(200).send(embedTemplate.replace("<!-- meta -->", await getMeta(url, req.originalUrl, viewType)));
    });
    app.use(express.static("./"));

    http.createServer(app).listen(port, () => {
        console.log(`App listening on port ${port}`);
    });
})();

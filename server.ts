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

const startBot = async (): Promise<void> => {
    if (!blueskyAccount || !blueskyKey) {
        console.error("Please set the environment variables SKYVIEW_BLUESKY_ACCOUNT and SKYVIEW_BLUESKY_PASSWORD to start the bot.");
        return;
    }
    BskyBot.setOwner({ handle: blueskyAccount, contact: "badlogicgames@gmail.com" });
    const bot = new BskyBot({ handle: blueskyAccount, replyToNonFollowers: true });
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
    console.log("Bot is running");
}

(async () => {
    try {
        await startBot();
    } catch (e) {
        console.error("Couldn't log in.");
        process.exit(-1);
    }

    const app = express();
    app.use(cors());
    app.use(compression());

    const toJsonOEmbed = (post: BskyPost): OEmbed => {
        const author_url = `https://bsky.app/profile/${post.author.did}`;
        const author_name = post.author.displayName ?? post.author.handle;
        const text = post.record.text;
        const url = `${author_url}/post/${post.uri.replace("at://", "").split("/")[2]}`;
        const author = post.author.displayName ? `${post.author.displayName} (@${post.author.handle})` : `@${post.author.handle}`;
        const oembed: OEmbed = {
            url,
            author_name,
            author_url,
            html: `
<blockquote class=\"bsky-skeet\">
    <p lang=\"${null ?? "de"}\" dir=\"ltr\">&quot;${text}</p>
    &mdash; ${author}
    <a href=\"${url}" data-createdAt=\"${post.record.createdAt}\">
        ${getTimeDifferenceString(post.record.createdAt)}
    </a>
</blockquote>
<script async src=\"https://skyview.social/widget.js\" charset=\"utf-8\"></script>
            `,
            width: 550,
            height: null,
            type: "rich",
            cache_age: "3153600000",
            provider_name: "skyview.social",
            provider_url: "https://skyview.social",
            version: "1.0",
        };
        return oembed;
    };

    const getOEmbed = async (url: string): Promise<string> => {
        const errorResponse = (reason: string) => `{error:"${reason}"}`;
        if (!url) {
            return errorResponse("No Url provided");
        }
        if (oembedCache.has(url)) {
            console.log("Load from oembed cache: " + url);
            return JSON.stringify(oembedCache.get(url));
        }
        const result = await loadThread(url, viewType);
        if (typeof result == "string") {
            return errorResponse("Couldn't load bsky.app thread");
        }
        const oembed = toJsonOEmbed(result.thread.post);
        console.log("Setting oembed cache entry: " + url);
        oembedCache.set(url, oembed);
        return JSON.stringify(oembed);
    };

    const getOEmbedUrl = (url: string, originalUri: string): string => {
        const oembedUrl = new Url("/oembed", originalUri);
        oembedUrl.searchParams.set("url", url);
        return oembedUrl.toString();
    };

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
                            <meta name="description" content="${text}" />
                            <meta property="og:title" content="${title}" />
                            <meta property="og:type" content="article" />
                            <meta property="og:description" content="${text}" />
                            ${avatar ? `<meta property="og:image" content="${avatar}" />` : ""}
                            <meta property="og:url" content="${url}" />
                            <meta name="twitter:card" content="summary_large_image" />
                            <meta property="twitter:domain" content="skyview.social" />
                            <meta property="twitter:url" content="${url}" />
                            <meta name="twitter:title" content="${title}" />
                            <meta name="twitter:description" content="${text}" />
                            ${avatar ? `<meta name="twitter:image" content="${avatar}" />` : ""}
                            <link rel="alternate" type="application/json+oembed" href="${getOEmbedUrl(url, originalUri)}" />
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
    const oembedCache = new Map<string, OEmbed>();
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
    app.get("/oembed", async (req, res) => {
        res.setHandler("Content-Type", "application/json+oembed");
        const url = req.query.url as string;
        res.status(200).send(await getOEmbed(url));
    });
    app.use(express.static("./"));

    http.createServer(app).listen(port, () => {
        console.log(`App listening on port ${port}`);
    });
})();

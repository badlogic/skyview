import compression from "compression";
import express from "express";
import * as http from "http";
import cors from "cors";
import { BskyBot, Events } from "easy-bsky-bot-sdk";

const port = process.env.PORT ?? 3333;
const blueskyAccount = process.env.SKYVIEW_BLUESKY_ACCOUNT!;
const blueskyKey = process.env.SKYVIEW_BLUESKY_PASSWORD!;

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
    app.use(express.static("site"));

    http.createServer(app).listen(port, () => {
        console.log(`App listening on port ${port}`);
    });
})();

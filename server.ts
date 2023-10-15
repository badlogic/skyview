import compression from "compression";
import express from "express";
import * as http from "http";
import cors from "cors";
import { BskyAgent } from "@atproto/api";
import * as api from "@atproto/api";

const port = process.env.PORT ?? 3333;
const blueskyAccount = process.env.SKYVIEW_BLUESKY_ACCOUNT!;
const blueskyKey = process.env.SKYVIEW_BLUESKY_PASSWORD!;

console.log(`BlueSky account: ${blueskyAccount}`);
console.log(`BlueSky key: ${blueskyKey}`);

(async () => {
    const agent = new BskyAgent({ service: "https://bsky.social" });
    const resp = await agent.login({
        identifier: blueskyAccount,
        password: blueskyKey,
    });
    if (!resp.success) {
        console.error("Couldn't log in.");
        process.exit(-1);
    }

    const app = express();
    app.use(cors());
    app.use(compression());
    app.use(express.static("site"));

    http.createServer(app).listen(port, () => {
        console.log(`App listening on port ${port}`);
    });
})();

import compression from "compression";
import express from "express";
import * as http from "http";
import cors from "cors"; // Import the cors middleware

const port = process.env.PORT;
const blueskyAccount = process.env.SKYVIEW_BLUESKY_ACCOUNT;
const blueskyKey = process.env.SKYVIEW_BLUESKY_KEY;

console.log(`BlueSky account: ${blueskyAccount}`);
console.log(`BlueSky key: ${blueskyKey}`);

const app = express();
app.use(cors());
app.use(compression());
app.use(express.static("site"));
app.get("/api/test", async (req, res) => {
    res.json({ result: "Test" });
});

http.createServer(app).listen(port, () => {
    console.log(`App listening on port ${port}`);
});

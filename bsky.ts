// @ts-ignore
import { Agent } from "@intrnl/bluesky-client/agent";
// @ts-ignore
import type { DID } from "@intrnl/bluesky-client/atp-schema";
import { RichText } from "@atproto/api";

const agent = new Agent({ serviceUri: "https://api.bsky.app" });

export type BskyAuthor = {
    did: string;
    avatar?: string;
    displayName: string;
    handle?: string;
};

export type BskyFacet = {
    features: { uri?: string; tag?: string }[];
    index: { byteStart: number; byteEnd: number };
};

export type BskyRecord = {
    createdAt: string;
    text: string;
    facets?: BskyFacet[];
};

export type BskyImage = {
    thumb: string;
    fullsize: string;
    alt: string;
    aspectRatio?: {
        width: number;
        height: number;
    };
};

export type BskyViewRecord = {
    $type: "app.bsky.embed.record#viewRecord";
    uri: string;
    cid: string;
    author: BskyAuthor;
    value?: BskyRecord;
    embeds: {
        media?: { images: BskyImage[] };
        images?: BskyImage[];
        external?: BskyExternalCard;
        record?: BskyViewRecord | BskyViewRecordWithMedia;
    }[];
};

export type BskyViewRecordWithMedia = {
    $type: "app.bsky.embed.record_with_media#viewRecord";
    record: BskyViewRecord;
};

export type BskyExternalCard = {
    uri: string;
    title: string;
    description: string;
    thumb?: string;
};

export type BskyPost = {
    uri: string;
    cid: string;
    author: BskyAuthor;
    record: BskyRecord;
    embed?: {
        media?: { images: BskyImage[] };
        images?: BskyImage[];
        external?: BskyExternalCard;
        record?: BskyViewRecord | BskyViewRecordWithMedia;
    };
    likeCount: number;
    replyCount: number;
    repostCount: number;
};

export type BskyThreadPost = {
    parent?: BskyThreadPost;
    post: BskyPost;
    replies: BskyThreadPost[];
};

export type ViewType = "tree" | "embed" | "unroll";

export async function collectFullThread(postUri: string) {
    const seen = new Set<string>();
    const threadCache = new Map<string, BskyThreadPost>();

    async function getAndCacheThread(uri: string) {
        const response = await agent.rpc.get("app.bsky.feed.getPostThread", {
            params: {
                uri,
                parentHeight: 100,
                depth: 100,
            },
        });

        if (!response?.success || !response.data?.thread) {
            throw new Error(`Failed to load thread for ${uri}`);
        }

        function cacheThreadPosts(thread: BskyThreadPost) {
            if (!seen.has(thread.post.uri)) {
                seen.add(thread.post.uri);
                threadCache.set(thread.post.uri, thread);
                thread.replies?.forEach(reply => cacheThreadPosts(reply));
            }
        }

        cacheThreadPosts(response.data.thread);
        return response.data.thread;
    }

    async function findRootPost(startUri: string): Promise<BskyThreadPost> {
        let currentThread = threadCache.get(startUri) || await getAndCacheThread(startUri);

        while (currentThread.parent) {
            const parentUri = currentThread.parent.post.uri;
            currentThread = threadCache.get(parentUri) || await getAndCacheThread(parentUri);
        }

        return currentThread;
    }

    async function processThreadBranch(post: BskyThreadPost): Promise<BskyThreadPost> {
        if (!post.replies?.length && post.post.replyCount > 0) {
            const freshData = await getAndCacheThread(post.post.uri);
            if (freshData.replies?.length) {
                post.replies = freshData.replies;
            }
        }

        if (post.replies?.length) {
            const fullReplies: BskyThreadPost[] = [];

            for (const reply of post.replies) {
                let fullReplyThread: BskyThreadPost;

                if (threadCache.has(reply.post.uri)) {
                    fullReplyThread = threadCache.get(reply.post.uri)!;
                } else {
                    fullReplyThread = await getAndCacheThread(reply.post.uri);
                }

                fullReplies.push(await processThreadBranch(fullReplyThread));
            }

            post.replies = fullReplies.sort((a, b) =>
                a.post.record.createdAt.localeCompare(b.post.record.createdAt)
            );
        }

        return post;
    }

    const rootPost = await findRootPost(postUri);
    const fullThread = await processThreadBranch(rootPost);

    return {
        thread: fullThread,
        rootUri: rootPost.post.uri
    };
}

export async function loadThread(url: string, viewType: ViewType): Promise<{ thread: BskyThreadPost; originalUri: string | undefined } | string> {
    try {
        const tokens = url.replace("https://", "").split("/");
        const actor = tokens[2];
        let rkey = tokens[4];
        if (!actor || !rkey) {
            return "Sorry, couldn't load thread (invalid URL)";
        }
        let did: DID;
        if (actor.startsWith("did:")) {
            did = actor as DID;
        } else {
            const response = await agent.rpc.get("com.atproto.identity.resolveHandle", {
                params: {
                    handle: actor,
                },
            });

            if (!response.success) {
                return "Sorry, couldn't load thread (invalid handle)";
            }
            did = response.data.did;
        }

        let originalUri = `at://${did}/app.bsky.feed.post/${rkey}`;
        let thread = (await collectFullThread(originalUri)).thread;

        if (!thread) {
            return "Sorry, couldn't load thread (invalid thread)";
        }
        if (viewType == "embed") {
            if (thread.post.record.text.includes("@skyview.social") && thread.post.record.text.includes("embed") && thread.parent) {
                thread = thread.parent;
            }
            thread.replies = [];
        }

        if (viewType == "unroll") {
            const posts: BskyThreadPost[] = [];
            posts.push(thread);
            while (true) {
                const post = posts[posts.length - 1];
                if (post.replies) {
                    post.replies.sort((a, b) => a.post.record.createdAt.localeCompare(b.post.record.createdAt));
                    const next = post.replies.find(
                        (reply) =>
                            reply.post.author.did == post.post.author.did &&
                            !reply.post.record.text.includes("@skyview.social") &&
                            !reply.post.record.text.includes("unroll")
                    );
                    if (!next) break;
                    posts.push(next);
                } else {
                    break;
                }
            }
            thread.replies = posts.length > 1 ? posts.slice(1, posts.length) : [];
            thread.replies.forEach((reply) => (reply.replies = []));
            if (thread.replies.length > 0) {
                const lastPost = thread.replies[thread.replies.length - 1];
                if (lastPost.post.record.text.includes("@skyview.social") && lastPost.post.record.text.includes("unroll")) {
                    thread.replies.pop();
                }
            }
        }

        return { thread, originalUri };
    } catch (e) {
        return `Sorry, couldn't load thread (exception) ${(e as any).message ? "\n" + (e as any).message : ""}`;
    }
}

function replaceHandles(text: string): string {
    const handleRegex = /@([\p{L}_.-]+)/gu;
    const replacedText = text.replace(handleRegex, (match, handle) => {
        return `<a class="text-primary" href="https://bsky.app/profile/${handle}" target="_blank">@${handle}</a>`;
    });

    return replacedText;
}

function applyFacets(record: BskyRecord) {
    if (!record.facets) {
        return record.text;
    }

    const rt = new RichText({
        text: record.text,
        facets: record.facets as any,
    });

    const text: string[] = [];

    for (const segment of rt.segments()) {
        if (segment.isMention()) {
            text.push(`<a class="text-primary" href="https:///profile/${segment.mention?.did}" target="_blank">${segment.text}</a>`);
        } else if (segment.isLink()) {
            text.push(`<a class="text-primary" href="${segment.link?.uri}" target="_blank">${segment.text}</a>`);
        } else if (segment.isTag()) {
            text.push(`<span class="text-blue-500">${segment.text}</span>`);
        } else {
            text.push(segment.text);
        }
    }
    const result = text.join("");
    return result;
}

export function processText(record: BskyRecord) {
    return replaceHandles(applyFacets(record)).trim().replaceAll("\n", "<br/>");
}

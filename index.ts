import { LitElement, TemplateResult, html, nothing, render, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { globalStyles } from "./styles";
import { map } from "lit-html/directives/map.js";
// @ts-ignore
import { Agent } from "@intrnl/bluesky-client/agent";
// @ts-ignore
import type { DID } from "@intrnl/bluesky-client/atp-schema";

function getTimeDifferenceString(inputDate: string): string {
    const currentDate = new Date();
    const inputDateTime = new Date(inputDate);

    const timeDifference = currentDate.getTime() - inputDateTime.getTime();
    const seconds = Math.floor(timeDifference / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);

    if (years > 0) {
        return `${years}y}`;
    } else if (days > 0) {
        return `${days}d`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

@customElement("skyview-popup")
export class Popup extends LitElement {
    static styles = globalStyles;

    @property()
    buttonText = "Click me";

    @property()
    show = false;

    protected render(): TemplateResult {
        return html`<div class="relative">
            <div @click=${() => (this.show = !this.show)} class="rounded bg-black p-1 text-xs">${this.buttonText}</div>
            ${this.show
                ? html`<div @click=${() => (this.show = !this.show)} class="absolute bg-black p-4 rounded border border-gray/50">
                      <slot></slot>
                  </div>`
                : nothing}
        </div> `;
    }
}

function dom(template: TemplateResult, container?: HTMLElement | DocumentFragment): HTMLElement[] {
    if (container) {
        render(template, container);
        return [];
    }

    const div = document.createElement(`div`);
    render(template, div);
    const children: Element[] = [];
    for (let i = 0; i < div.children.length; i++) {
        children.push(div.children[i]);
    }
    return children as HTMLElement[];
}

function renderGallery(images: BskyImage[], expandGallery = false): HTMLElement {
    const galleryDom = dom(html`
        <div class="flex flex-col gap-2">
            ${images.map(
                (img, index) => html`
                    <div class="relative ${index && !expandGallery ? "hidden" : ""}">
                        <img src="${img.thumb}" alt="${img.alt}" ) />
                        ${img.alt && img.alt.length > 0
                            ? html`<skyview-popup buttonText="ALT" text="${img.alt}" class="absolute left-1 bottom-1 cursor-pointer">
                                  <div class="w-[350px]">${img.alt}</div>
                              </skyview-popup>`
                            : nothing}
                    </div>
                `
            )}
        </div>
    `)[0];

    const imageDoms = galleryDom.querySelectorAll("img");
    const imageClickListener = () => {
        imageDoms.forEach((img, index) => {
            if (index == 0) return;
            img.parentElement!.classList.toggle("hidden");
        });
        if (imageDoms[1].classList.contains("hidden")) {
            imageDoms[0].scrollIntoView({
                behavior: "auto",
                block: "nearest",
            });
        }
    };

    if (!expandGallery) {
        for (let i = 0; i < imageDoms.length; i++) {
            imageDoms[i].addEventListener("click", imageClickListener);
        }
    }
    return galleryDom;
}

export const agent = new Agent({ serviceUri: "https://api.bsky.app" });

type BskyAuthor = {
    did: string;
    avatar?: string;
    displayName: string;
    handle: string;
};

type BskyRecord = {
    createdAt: string;
    text: string;
};

type BskyImage = {
    alt: string;
    aspectRatio: {
        width: number;
        height: number;
    };
    fullsize: string;
    thumb: string;
};

type BskyQuotedPostRecord = {
    author: BskyAuthor;
    cid: string;
    uri: string;
    value: BskyRecord;
};

type BskyPost = {
    post: {
        author: BskyAuthor;
        cid: string;
        uri: string;
        likeCount: number;
        replyCount: number;
        repostCount: number;
        record: BskyRecord;
        embed?: {
            record?: BskyQuotedPostRecord;
            images?: BskyImage[];
        };
    };
    replies: BskyPost[];
};

const contentLoader = html`<div class="flex space-x-4 animate-pulse w-[80%] max-w-[300px] m-auto py-4">
    <div class="rounded-full bg-gray h-10 w-10"></div>
    <div class="flex-1 space-y-6 py-1">
        <div class="h-2 bg-gray rounded"></div>
        <div class="space-y-3">
            <div class="grid grid-cols-3 gap-4">
                <div class="h-2 bg-gray rounded col-span-2"></div>
                <div class="h-2 bg-gray rounded col-span-1"></div>
            </div>
            <div class="h-2 bg-gray rounded"></div>
        </div>
    </div>
</div>`;

@customElement("skyview-app")
export class App extends LitElement {
    static styles = [globalStyles];

    @query("#url")
    urlElement!: HTMLInputElement;

    @state()
    error?: string;

    url: string | null = null;

    @state()
    loading = false;

    @state()
    thread?: BskyPost;

    constructor() {
        super();
        this.url = new URL(location.href).searchParams.get("url");
        if (this.url) this.load();
    }

    async load() {
        if (!this.url) {
            this.loading = false;
            this.error = "Sorry, couldn't load thread (no URL given)";
            return;
        }
        this.loading = true;
        try {
            const tokens = this.url.replace("https://", "").split("/");
            const actor = tokens[2];
            const rkey = tokens[4];
            if (!actor || !rkey) {
                this.error = "Sorry, couldn't load thread (invalid URL)";
                return;
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
                    this.error = "Sorry, couldn't load thread (invalid handle)";
                    return;
                }
                did = response.data.did;
            }

            const response = await agent.rpc.get("app.bsky.feed.getPostThread", {
                params: {
                    uri: `at://${did}/app.bsky.feed.post/${rkey}`,
                    parentHeight: 1,
                    depth: 100,
                },
            });

            if (!response.success) {
                this.error = "Sorry, couldn't load thread (invalid response)";
                return;
            }

            if (!response.data.thread) {
                this.error = "Sorry, couldn't load thread (invalid data)";
                return;
            }

            console.log(response);
            this.thread = response.data.thread;
        } catch (e) {
            this.error = "Sorry, couldn't load thread (exception)";
            return;
        } finally {
            this.loading = false;
        }
    }

    render() {
        let content: TemplateResult = html``;
        if (this.loading) {
            content = contentLoader;
        } else if (this.error) {
            content = html`<div>Error: ${this.error}</div>`;
        } else if (this.thread) {
            content = html` <a
                    class="text-center font-bold text-primary"
                    href="https://bsky.app/profile/${this.thread.post.author.did}/post/${this.thread.post.uri.replace("at://", "").split("/")[2]}"
                    >View thread on BlueSky</a
                >
                ${this.postPartial(this.thread)}`;
        } else {
            content = html`<div class="text-center">
                    View and share <a class="text-primary font-bold" href="https://bsky.app">BlueSky</a> threads.
                </div>
                <div class="flex mt-4">
                    <input
                        id="url"
                        class="flex-1 bg-black border border-gray/75 outline-none rounded-l px-2 py-2"
                        placeholder="Link to a post in a Bluesky thread"
                        value="https://bsky.app/profile/katquat.bsky.social/post/3kbssygzj632a"
                    />
                    <button class="align-center rounded-r bg-primary text-white px-4" @click=${this.viewPosts}>View</button>
                </div>`;
        }

        return html`<main class="flex flex-col justify-between m-auto max-w-[600px] px-4 h-full">
            <a class="text-2xl text-primary font-bold text-center my-4" href="/">Skyview</a>
            <div class="flex-grow flex flex-col">${content}</div>
            <div class="text-center italic my-4 mb-8">
                Lovingly made by <a class="text-primary" href="https://bsky.app/profile/badlogic.bsky.social">Mario Zechner</a><br />
                No data is collected, not even your IP address.
                <a class="text-primary" href="https://github.com/badlogic/skyview"><br />Source code</a>
            </div>
        </main>`;
    }

    viewPosts() {
        if (!this.urlElement) return;

        const newUrl = new URL(location.href);
        newUrl.searchParams.set("url", this.urlElement.value);
        window.history.replaceState({}, document.title, newUrl.href);
        window.location.reload();
    }

    postPartial(post: BskyPost): TemplateResult {
        const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

        const recordPartial = (author: BskyAuthor, uri: string, record: BskyRecord, isQuote = false) =>
            html`<div class="flex items-center gap-2">
                    <a class="flex items-center gap-2" href="https://bsky.app/profile/${author.handle}">
                        ${author.avatar ? html`<img class="w-[2em] h-[2em] rounded-full" src="${author.avatar}" />` : defaultAvatar}
                        <span class="text-primary">${author.displayName}</span>
                    </a>
                    <a class="text-xs text-primary/75" href="https://bsky.app/profile/${author.did}/post/${uri.replace("at://", "").split("/")[2]}"
                        >${getTimeDifferenceString(record.createdAt)}</a
                    >
                </div>
                <div class="${isQuote ? "italic" : ""} mt-1">${record.text}</div>`;

        const quotedPost = post.post.embed?.record;
        const images = post.post.embed?.images ? renderGallery(post.post.embed.images) : undefined;

        return html`<div>
            <div class="flex flex-col mt-4">
                ${recordPartial(post.post.author, post.post.uri, post.post.record)} ${images ? html`<div class="mt-2">${images}</div>` : nothing}
                ${quotedPost
                    ? html`<div class="border border-gray/50 rounded p-4 mt-2">
                          ${recordPartial(quotedPost.author!, quotedPost.uri, quotedPost.value, true)}
                      </div>`
                    : nothing}
            </div>
            ${post.replies.length > 0
                ? html`<div class="border-l border-dotted border-gray/50 pl-4">${map(post.replies, (reply) => this.postPartial(reply))}</div>`
                : nothing}
        </div>`;
    }
}

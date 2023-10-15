import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { globalStyles } from "./styles";

export function get(url: string) {
    if (location.href.includes("localhost")) {
        url = "http://localhost:3333" + url;
    }
    return fetch(url);
}

@customElement("skyview-app")
export class App extends LitElement {
    static styles = [globalStyles];

    @state()
    message?: string;

    constructor() {
        super();
        this.load();
    }

    async load() {
        const response = await get("/api/test");
        if (response.status != 200) this.message = "Error";
        else this.message = (await response.json()).result;
    }

    render() {
        return html`<h1>This is a test</h1>
            ${this.message ? html`<div>${this.message}</div>` : nothing}`;
    }
}

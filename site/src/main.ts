// The windows on this page are the Pine app itself: its own page (app/index.html, as pine builds it), each
// in a frame of the window's size that is scaled to its place in the grid. Instead of a daemon the app has
// a recording of one (app/reel.js, scripts/capture.mjs), so what moves in a window is the app at work: a
// message is typed, the agent answers, a diff opens. This file puts the frames in, draws the pointer of
// the hand that works them, and keeps the lists beside them in step. Everything else on the page is CSS.

const still = matchMedia("(prefers-reduced-motion: reduce)");
const num = (el: Element, name: string, or = 0) => Number(getComputedStyle(el).getPropertyValue(name)) || or;

type Reel = { play(): void; pause(): void; seek(name: string): Promise<void> };
type Said = { reel: string; type: "ready" | "chapter" | "end" | "pointer" | "view"; name?: string; ms?: number; x?: number; y?: number; down?: boolean; off?: boolean };

/** How quickly something that follows comes to where it is going: after this long, two thirds of the way is done. */
const TAU = 110;
/** A step of following, however long the frame was. */
const damp = (from: number, to: number, ms: number, tau = TAU) => to + (from - to) * Math.exp(-ms / tau);

// ---- what moves with the scroll ----------------------------------------------------------------------
//
// Where the browser has scroll timelines, the browser moves them itself, on the frame the page scrolls on
// (style.css, under .scrolls). Elsewhere each such element gets --v here, how far the page has come for it,
// from 0 to 1, set on every frame the page scrolls on, and style.css says what that moves (under .moves).

/** Which elements, and what their 0 and 1 are. */
const FOLLOW: Array<[string, "page" | "top" | "pass" | "arrive" | "enter"]> = [
	[".hatch .fill", "page"], // the whole page, top to bottom
	[".crop", "top"], // the first screen
	["[data-drift]", "pass"], // from coming in at the bottom to leaving at the top
	[".hero .shot, .events .shot, .layered .shot", "arrive"], // from coming in to standing in the middle
	[".src, .stats li", "enter"], // while it comes in
];
const timelines = CSS.supports("animation-timeline: view()") && CSS.supports("animation-range: cover");
if (!still.matches && timelines) document.documentElement.classList.add("scrolls");
else if (!still.matches) {
	type Mover = { el: HTMLElement; kind: (typeof FOLLOW)[number][1]; top: number; height: number; v: number };
	const movers: Mover[] = FOLLOW.flatMap(([sel, kind]) => [...document.querySelectorAll<HTMLElement>(sel)].map((el) => ({ el, kind, top: 0, height: 0, v: NaN })));
	/** Where an element stands on the page, as the layout has it: what moves it (a transform) does not count. */
	const measure = () => {
		for (const m of movers) {
			let top = 0;
			for (let el: HTMLElement | null = m.el; el; el = el.offsetParent as HTMLElement | null) top += el.offsetTop;
			m.top = top;
			m.height = m.el.offsetHeight;
		}
	};
	const clamp = (n: number) => Math.min(1, Math.max(0, n));
	const aimOf = (m: Mover, y: number, screen: number) => {
		if (m.kind === "page") return clamp(y / Math.max(1, document.documentElement.scrollHeight - screen));
		if (m.kind === "top") return clamp(y / screen);
		const from = m.top - screen; // its top is at the bottom of the screen
		if (m.kind === "pass") return clamp((y - from) / (m.height + screen));
		if (m.kind === "arrive") return clamp((y - from) / ((m.height + screen) / 2));
		return clamp((y - from) / Math.max(1, Math.min(m.height, screen)));
	};
	let queued = false;
	const frame = () => {
		queued = false;
		const y = scrollY, screen = innerHeight;
		for (const m of movers) {
			const v = aimOf(m, y, screen);
			if (Math.abs(v - m.v) < 0.0001) continue;
			m.v = v;
			m.el.style.setProperty("--v", v.toFixed(4));
		}
	};
	const follow = () => {
		if (!queued) (queued = true), requestAnimationFrame(frame);
	};
	measure();
	document.documentElement.classList.add("moves");
	frame();
	addEventListener("scroll", follow, { passive: true });
	// The page's height changes when its width does, and when a window of the app gets its height.
	new ResizeObserver(() => { measure(); follow(); }).observe(document.querySelector("main") ?? document.body);
}

const POINTER = '<svg viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.3-4.1 2.8 6.6 3-1.3-2.8-6.5H18L5 2.5Z"/></svg><b></b>';

for (const shot of document.querySelectorAll<HTMLElement>("[data-reel]")) {
	const story = shot.dataset.reel!;
	/** A story in parts that follow one another, each with a line in a list (hero, code); or parts of their own, one shown at a time (events). */
	const apart = shot.hasAttribute("data-apart");
	const marks = [...(shot.closest("section")?.querySelectorAll<HTMLElement>("[data-show]") ?? [])];
	const names = [...new Set(marks.map((m) => m.dataset.show!))];
	const list = marks.find((m) => m.closest(".show-list"))?.closest<HTMLElement>(".show-list");

	/** The window's height as the page says it; a window that fills the room it is given gets that room's height instead. */
	const high = shot.style.getPropertyValue("--h");
	const fit = () => {
		const s = shot.clientWidth / num(shot, "--wv", 1280);
		shot.style.setProperty("--s", String(s));
		shot.style.setProperty("--h", getComputedStyle(shot).aspectRatio === "auto" && s ? String(Math.round(shot.clientHeight / s)) : high);
		aim();
	};

	// Where a window is wider than its place (a phone shows a part of it), the part that shows follows the hand:
	// to the side bar when it clicks there, to the panel when a diff opens, and back when it has left.
	let point: { x: number; y: number } | undefined;
	let talk: number | undefined;
	let cam = NaN, camTo = NaN, camFrame = 0, camHome = 0, camAt = 0;
	const room = () => Math.max(0, num(shot, "--win", 1280) - num(shot, "--wv", 1280));
	const place = () => {
		if (!point) return;
		const s = num(shot, "--s", 1);
		hand.style.transform = `translate(${(point.x - num(shot, "--xv")) * s}px, ${(point.y - num(shot, "--yv")) * s}px)`;
	};
	const pan = (now: number) => {
		camFrame = 0;
		const to = Math.min(room(), Math.max(0, camTo));
		cam = Math.abs(to - cam) < 0.6 ? to : damp(cam, to, Math.min(50, now - camAt), 180);
		camAt = now;
		shot.style.setProperty("--xc", cam.toFixed(1));
		place();
		if (cam !== to) camFrame = requestAnimationFrame(pan);
	};
	function aim(x?: number) {
		clearTimeout(camHome);
		if (!room()) return void (shot.style.removeProperty("--xc"), (cam = NaN), place());
		// Where nothing is pointed at, the conversation shows: the app says where its middle is.
		const home = talk === undefined ? num(shot, "--xh") : talk - num(shot, "--wv", 1280) / 2;
		if (Number.isNaN(cam)) cam = Math.min(room(), Math.max(0, home));
		camTo = x === undefined ? home : x - num(shot, "--wv", 1280) / 2;
		if (!camFrame) (camAt = performance.now()), (camFrame = requestAnimationFrame(pan));
	}

	const win = shot.appendChild(Object.assign(document.createElement("div"), { className: "win" }));
	const hand = shot.appendChild(Object.assign(document.createElement("i"), { className: "pointer", innerHTML: POINTER }));
	hand.setAttribute("aria-hidden", "true");
	fit();
	new ResizeObserver(fit).observe(shot);

	let frame: HTMLIFrameElement | undefined;
	let ready = false;
	let seen = false;
	/** The owner's pointer is on the list of sources: what it points at stays. */
	let held = false;
	let at = names[0] ?? "";
	let turn = 0;
	/** The story is over, and nothing came after it because the window was off the screen. */
	let ended = false;
	/** With reduced motion nothing plays by itself: only what the owner asked for, by a click or by pointing. */
	let asked = false;
	const may = () => !still.matches || asked;
	const reel = () => (frame?.contentWindow as (Window & { reel?: Reel }) | null | undefined)?.reel;

	/** The app, loaded anew: from the story's start, or from one of its checkpoints. */
	function load(from?: string) {
		ready = false;
		shot.classList.remove("live");
		hand.classList.remove("on");
		point = undefined;
		aim();
		const next = document.createElement("iframe");
		next.className = "app";
		next.title = "The Pine app";
		// It is a picture of the app at work: it takes no pointer, no keys and no focus.
		next.tabIndex = -1;
		next.inert = true;
		next.setAttribute("aria-hidden", "true");
		turn++;
		next.src = `/app/#story=${story}${from ? `&at=${from}` : ""}`;
		// The window that was there stays until the new one has drawn itself.
		frame = next;
		win.append(next);
	}
	const mark = (name: string, ms?: number) => {
		at = name;
		for (const m of marks) {
			const on = m.dataset.show === name;
			m.classList.toggle("on", on);
			// The bar under a list's item runs for as long as its part of the story takes.
			if (on && m.closest(".show-list")) {
				if (ms) m.style.setProperty("--show-ms", `${Math.round(ms)}ms`);
				m.style.animation = "none";
				void m.offsetWidth;
				m.style.animation = "";
			}
		}
	};
	const go = (name: string) => {
		asked = true;
		ended = false;
		mark(name);
		if (!frame) return void load(name);
		// Parts of their own start in the app as it is, which is told that its pine started again. A part of a longer story needs the window that story has made by then: the app is loaded there.
		if (apart && ready) return void (reel()?.seek(name), seen && reel()?.play());
		load(name);
	};

	/** Of parts of their own, the one after the one that played. (It is not something the owner asked for.) */
	const next = () => {
		const name = names[(names.indexOf(at) + 1) % names.length];
		mark(name);
		void reel()?.seek(name);
	};

	addEventListener("message", (e) => {
		const said = e.data as Said;
		if (e.origin !== location.origin || said?.reel !== story || e.source !== frame?.contentWindow) return;
		if (said.type === "ready") {
			ready = true;
			shot.classList.add("live");
			frame!.classList.add("on");
			for (const f of win.querySelectorAll("iframe")) if (f !== frame) setTimeout(() => f.remove(), 450);
			if (seen && may()) reel()?.play();
		} else if (said.type === "chapter" && said.name) mark(said.name, said.ms);
		else if (said.type === "end") {
			if (still.matches) return;
			// A story in parts starts over; of parts of their own the next one comes, unless the owner points at this one.
			// (Unless the owner has asked for another part meanwhile.)
			const was = turn, here = at;
			setTimeout(() => {
				if (turn !== was || at !== here || held) return;
				// Nobody is looking: it goes on when the window is on the screen again.
				if (!seen) return void (ended = true);
				if (apart) next();
				else load();
			}, 350);
		} else if (said.type === "view") {
			talk = said.x;
			if (!hand.classList.contains("on")) aim();
		} else if (said.type === "pointer") {
			if (said.off) {
				hand.classList.remove("on");
				// The hand has left: after a moment the window shows the conversation again.
				if (room()) camHome = window.setTimeout(() => aim(), 1200);
				return;
			}
			point = { x: said.x ?? 0, y: said.y ?? 0 };
			if (room()) aim(point.x);
			place();
			hand.classList.add("on");
			if (said.down) { hand.classList.remove("click"); void hand.offsetWidth; hand.classList.add("click"); }
		}
	});

	for (const m of marks) {
		const name = m.dataset.show!;
		m.addEventListener("click", () => go(name));
		// A list of the sources: the one under the pointer plays, and stays while the pointer is on the list.
		if (m.closest("[data-hover]")) m.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && (name !== at || !held)) { held = true; go(name); } });
	}
	shot.closest("section")?.querySelector("[data-hover]")?.addEventListener("pointerleave", () => { held = false; });

	// The app is loaded when its window comes near the screen, and plays while it is on it.
	new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); if (!frame) load(apart ? at : undefined); } }, { rootMargin: "100% 0px" }).observe(shot);
	new IntersectionObserver(([e]) => {
		seen = e.isIntersecting;
		list?.classList.toggle("paused", !seen);
		if (!ready) return;
		if (seen && ended && may()) {
			ended = false;
			if (apart) next();
			else load();
		} else if (seen && may()) reel()?.play();
		else reel()?.pause();
	}, { threshold: 0.3 }).observe(shot);
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
	button.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(button.dataset.copy ?? "");
			button.textContent = "Copied";
		} catch {
			button.textContent = "Select it";
		}
		setTimeout(() => (button.textContent = "Copy"), 1600);
	});
}

// The install card: the app for the visitor's own computer first, the other systems one click away.
// What the browser says is a guess (Safari never says Apple silicon from Intel), so every other file
// is linked beside the button. The file names come from the latest release, asked of GitHub once;
// without an answer the buttons go to the release's page.
type Os = "mac" | "win" | "linux" | "phone";
const card = document.querySelector<HTMLElement>("[data-dl]");
if (card) {
	const tabs = [...card.querySelectorAll<HTMLButtonElement>(".os-tabs [data-os]")];
	const panes = [...card.querySelectorAll<HTMLElement>(".dl-os")];
	const show = (os: Os) => {
		for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.dataset.os === os));
		for (const pane of panes) pane.hidden = pane.dataset.os !== os;
	};
	for (const tab of tabs) tab.addEventListener("click", () => show(tab.dataset.os as Os));

	// A phone gets the Phone tab, as Android or as iOS. iPadOS says it is a Mac, and only its touch tells it apart.
	const asked = new URLSearchParams(location.search).get("os");
	const ua = navigator.userAgent;
	const ios = asked === "ios" || /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	const android = asked === "android" || /Android/.test(ua);
	const forced = asked === "ios" || asked === "android" ? "phone" : (asked as Os | null);
	const guessed: Os | null = ios || android ? "phone" : /Windows/.test(ua) ? "win" : /Mac OS X|Macintosh/.test(ua) ? "mac" : /Linux|X11/.test(ua) ? "linux" : null;
	const os = forced ?? guessed ?? "mac";
	const phone = card.querySelector<HTMLElement>('.dl-os[data-os="phone"]');
	if (phone) phone.dataset.phone = ios ? "ios" : "android";
	// Sending the page to a computer means something only on a phone.
	if (guessed !== "phone") card.querySelector(".dl-share")?.setAttribute("hidden", "");
	show(os);
	const seen = card.querySelector<HTMLElement>("[data-dl-seen]");
	const names = { mac: "macOS", win: "Windows", linux: "Linux", phone: ios ? "an iPhone" : "an Android phone" };
	if (seen) seen.textContent = guessed ? `Looks like ${names[guessed]}` : "Pick your system";

	// Chromium tells the architecture: the visitor's own kind of machine gets its file first, and the
	// line under the button offers the other one. Safari and Firefox do not tell it.
	const ud = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ architecture?: string }> } }).userAgentData;
	const other: Record<Exclude<Os, "phone">, { arm: [string, string, string, string]; x86: [string, string, string, string] }> = {
		mac: { arm: ["mac-arm64", "mac-x64", "Apple silicon", "Intel Mac? Download for Intel"], x86: ["mac-x64", "mac-arm64", "Intel", "Apple silicon? Download for Apple silicon"] },
		win: { arm: ["win-arm64", "win-x64", "ARM", "x64 PC? Download for x64"], x86: ["win-x64", "win-arm64", "x64", "ARM PC? Download for ARM"] },
		linux: { arm: ["linux-appimage-arm64", "linux-appimage-x64", "arm64", "x86_64? AppImage for x86_64"], x86: ["linux-appimage-x64", "linux-appimage-arm64", "x86_64", "ARM? AppImage for arm64"] },
	};
	if (guessed && guessed !== "phone") ud?.getHighEntropyValues(["architecture"]).then(({ architecture }) => {
		const kind = architecture === "arm" ? "arm" : architecture === "x86" ? "x86" : null;
		if (!kind) return;
		const [main, alt, name, line] = other[guessed][kind];
		const pane = card.querySelector<HTMLElement>(`.dl-os[data-os="${guessed}"]`);
		const button = pane?.querySelector<HTMLAnchorElement>(".dl-btn");
		const altLink = pane?.querySelector<HTMLAnchorElement>("[data-dl-alt]");
		const info = pane?.querySelector("[data-dl-info]");
		if (!button || !altLink || !info?.firstChild) return;
		button.dataset.dlFile = main;
		altLink.dataset.dlFile = alt;
		const [question, label] = line.split("? ");
		altLink.textContent = label;
		const before = altLink.previousSibling;
		// Only the question just before the link changes: "Debian or Ubuntu? ... · ARM? " keeps its start.
		if (before?.textContent) before.textContent = before.textContent.replace(/[^·?]*\?\s*$/, (m) => `${m.startsWith(" ") ? " " : ""}${question}? `);
		info.firstChild.textContent = `${name} · `;
		// On Linux the .deb follows the AppImage: the visitor's own kind first, the other beside the other AppImage.
		const deb = pane?.querySelector<HTMLAnchorElement>("[data-dl-deb]");
		const altDeb = pane?.querySelector<HTMLAnchorElement>("[data-dl-alt-deb]");
		if (deb && altDeb) {
			deb.dataset.dlFile = kind === "arm" ? "linux-deb-arm64" : "linux-deb-x64";
			altDeb.dataset.dlFile = kind === "arm" ? "linux-deb-x64" : "linux-deb-arm64";
			altDeb.textContent = kind === "arm" ? ".deb for x86_64" : ".deb for arm64";
		}
		link();
	}).catch(() => {});

	const patterns: Record<string, RegExp> = {
		"mac-arm64": /-arm64\.dmg$/, "mac-x64": /-x64\.dmg$/,
		"win-x64": /-x64-setup\.exe$/, "win-arm64": /-arm64-setup\.exe$/,
		"linux-appimage-x64": /-x86_64\.AppImage$/, "linux-appimage-arm64": /-arm64\.AppImage$/,
		"linux-deb-x64": /-amd64\.deb$/,
		"linux-deb-arm64": /-arm64\.deb$/,
		android: /\.apk$/,
	};
	let assets: Array<{ name: string; browser_download_url: string }> = [];
	const link = () => {
		for (const a of card.querySelectorAll<HTMLAnchorElement>("[data-dl-file]")) {
			const hit = assets.find((x) => patterns[a.dataset.dlFile ?? ""]?.test(x.name));
			if (hit) a.href = hit.browser_download_url;
		}
	};
	fetch("https://api.github.com/repos/pmndre/pine/releases/latest")
		.then((r) => (r.ok ? r.json() : Promise.reject()))
		.then((release: { tag_name: string; assets: typeof assets }) => {
			assets = release.assets;
			for (const v of card.querySelectorAll("[data-dl-version]")) v.textContent = release.tag_name;
			link();
		})
		.catch(() => {});
}

// Send this page on to a computer: the system's share sheet where there is one (phones), else the address copied.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-share]")) {
	const label = button.textContent;
	button.addEventListener("click", async () => {
		const url = `${location.origin}/#install`;
		try {
			if (navigator.share) await navigator.share({ title: "Pine", text: "Install Pine on this computer", url });
			else {
				await navigator.clipboard.writeText(url);
				button.textContent = "Link copied";
				setTimeout(() => (button.textContent = label), 1600);
			}
		} catch {}
	});
}

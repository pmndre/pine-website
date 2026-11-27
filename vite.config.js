import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

// The sources are in site/; the built site goes to the top of the repository, where Cloudflare Pages
// serves it as it is (the project has no build step of its own).
//
// The windows of the site are the Pine app's own page, in app/ at the top of the repository: its files
// as pine builds them and the recordings it plays (both made by scripts/capture.mjs), and the player,
// site/public/app/reel.js, which a build copies there. `vite dev` serves that folder too.
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const app = () => ({
	name: "pine-app",
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			let url = (req.url ?? "").split("?")[0];
			if (!url.startsWith("/app/")) return next();
			if (url === "/app/") url = "/app/index.html";
			const file = path.join(import.meta.dirname, decodeURIComponent(url));
			// (The player is the site's own file: Vite serves it from site/public.)
			if (url === "/app/reel.js" || !file.startsWith(path.join(import.meta.dirname, "app")) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
			res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache", "access-control-allow-origin": "*" });
			fs.createReadStream(file).pipe(res);
		});
	},
	// The player and the view's clock keep their names from one version of the site to the next, and browsers
	// keep such a file for hours: the pages that load them name them with their content's hash, so that a new
	// player is a new address, and a visitor who was here before never plays new recordings with an old one.
	closeBundle() {
		const hash = (name) => createHash("sha256").update(fs.readFileSync(path.join(import.meta.dirname, "app", name))).digest("hex").slice(0, 10);
		for (const [page, name] of [["index.html", "reel.js"], ["view.html", "view-clock.js"]]) {
			const file = path.join(import.meta.dirname, "app", page);
			if (!fs.existsSync(file)) continue;
			const re = new RegExp(`src="\\./${name.replace(".", "\\.")}(\\?v=[0-9a-f]+)?"`);
			fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(re, `src="./${name}?v=${hash(name)}"`));
		}
	},
});

export default defineConfig({
	root: "site",
	// Two pages: the site, and the privacy text of the browser extension (privacy/), which its store listing names.
	build: { outDir: "..", emptyOutDir: false, rollupOptions: { input: { index: path.join(import.meta.dirname, "site", "index.html"), privacy: path.join(import.meta.dirname, "site", "privacy", "index.html") } } },
	// The view's frame is sandboxed, so its origin is "null": its module scripts load only with CORS
	// (site/public/_headers does the same where Cloudflare serves the site).
	server: { cors: true },
	preview: { cors: true },
	plugins: [app()],
});

# pine-website

The website of [pine](https://github.com/pmndre/pine), served at pine.pmnd.re by Cloudflare Pages.

The sources are in `site/` and built with Vite into the top of the repository (`index.html`,
`privacy/`, `assets/`, `fonts/`, `app/reel.js`), which Pages serves as it is: the Pages project has no build
step of its own. So the built files are committed. Build before you commit:

```bash
npm install
npm run dev      # the sources, http://localhost:5173
npm run build    # the site, into the top of the repository
```

| | |
|---|---|
| `site/index.html` | The page |
| `site/privacy/index.html` | The privacy text of pine's browser extension, at `/privacy/`: the Chrome Web Store listing names it. Keep it true to `extension/PRIVACY.md` in pine |
| `site/src/style.css` | The grid, the type, the panels, the scroll effects |
| `site/src/main.ts` | Puts the app's windows in, draws the pointer, keeps the lists beside them in step |
| `site/public/app/reel.js` | The player: what the app's page has instead of a daemon |
| `site/public/app/view-clock.js` | The recording's clock for the frame the app's view panel runs a view in |
| `site/public/_headers` | CORS for the app's scripts: the view's frame is sandboxed, so it loads them cross-origin |
| `app/` | The Pine app's page and the recordings it plays (made by the capture) |
| `scripts/capture.mjs` | The capture |

## The windows of the app

They are the Pine app itself. `app/index.html` is the page of pine's `desktop/`, as pine builds it,
and each window on the site is that page in a frame of the window's size (1280 × 800), scaled to its
place. Nothing in it is redrawn or restyled: the colours, the controls, the code pane and the
terminal are the app's own.

What the page does not have here is a daemon. The app talks to the outside through one object,
`window.pine` (the bridge of `desktop/electron/preload.ts`), and `reel.js` is that object: it answers
every call with what a real daemon answered when the session was recorded, sends the daemon's events
as they came then, and does again what the owner did then: it types into the app's input and clicks
the app's buttons. So an answer streams in, a dialog asks, a diff opens, because the app does that.

```bash
npm run capture                # every story
npm run capture -- hero code   # some of them: hero, code, events, log, swarm
```

starts the real app (from a pine checkout beside this one, `../pine`, with `desktop/` installed) on a
pine home of its own with pine's scripted model, plays the stories, and writes down everything that
crosses the bridge. It writes `app/stories/<name>.json`, the pictures the daemon served into
`app/media/`, and the app's page with the files it loads into `app/`. It needs a Mac and poppler's
`pdftoppm`, and takes a few minutes. The app's window opens behind your windows. Its folders lie
under /Users/Shared while it runs. Run it again when the app changes, then build.

| Story | What happens in it |
|---|---|
| `hero` | The main agent makes an agent for the bills; the owner tells it what to watch; a letter is scanned; it is on the list |
| `events` | 22 parts, one for each source: an event arrives in a conversation, and its agent answers |
| `log` | The event log, which goes on without end |
| `code` | One conversation in a folder: a worktree, a diff, the terminal, a goal with its steps, the browser |
| `swarm` | `/swarm` on the shop: main hands a translation into 12 languages to 12 sub-agents at once on one board, the overview shows them and three other agents that events wake meanwhile, and a sub-agent that did none of it checks the answer |

A story has checkpoints, places it can be started from: the chapters beside a window, and each
source of the events. To watch one alone, with the player's own pointer:

```
http://localhost:5173/app/index.html#story=code&at=diff
```

What the player could not find in a recording it says in the console (`[reel] …`).

## The grid

Every panel has the same width, and every row inside it is a `.g` with the same columns: 12 from
1024 px, 6 from 640 px, 4 below. An element's columns are set inline: `--c` (12), `--cm` (6) and
`--cs` (4), for example `style="--c: 4 / 8; --cm: 1 / -1"`. Vertical sizes are multiples of 8 px.
`.guides` draws the columns with the same grid, so a line is always on an edge.

Fonts: Archivo (variable, width 62–125) and JetBrains Mono, both OFL.

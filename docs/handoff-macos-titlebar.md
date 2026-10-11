# HANDOFF — Dorion-V2, macOS titlebar (#332)

Paste this whole file to the next agent. Everything below was verified against the live repo
and running app; where something was NOT verified it is called out explicitly.

---

## 1. Mission

`ChloeVPin/Clorion` is our own standalone continuation of **SpikeHD/Dorion** — a tiny
alternative Discord client (Tauri v2, Rust backend + TypeScript/JS injection, GPL-3.0).

- Upstream: <https://github.com/SpikeHD/Dorion>
- Ours: <https://github.com/ChloeVPin/Clorion>
- Local path: `/Users/chloe/desktop/developer/Dorion-V2`
- Created as a **standalone repo, not a GitHub fork** (mirror-cloned, full history: 1572 commits,
  fork badge absent, `parent: none`). Base commit `9f75ff4`, matches upstream exactly.

We are working through **macOS-only bugs**. Upstream is Windows-first and the macOS side was
started but never finished.

## 2. Decisions already made (do not re-litigate)

| Decision | Choice |
|---|---|
| Branding | **Keep the "Dorion" name.** Only strip SpikeHD-specific links (e.g. `FUNDING.yml` PayPal). |
| Upstream | **Hard fork — ignore upstream.** (⚠️ `upstream` remote is still configured; removing it is an open TODO.) |
| Signing / notarisation | **Out of scope by decision.** We will not pay for an Apple Developer account. |
| — and therefore | macOS mic/camera (#375) and passkeys (#394) are **parked**. |
| First fix | **macOS titlebar (#332)** — implemented, pending visual sign-off. |
| Approach for #332 | **Vendor the shelter plugin locally** (chosen over Rust-only or writing our own). |

## 3. Environment — critical gotchas

These cost real time. Read them before running anything.

1. **Rust is installed but NOT on `PATH` for non-login shells.**
   `rustc`/`cargo` live in `~/.cargo/bin`. `~/.profile` has `. "$HOME/.cargo/env"`, but bash only
   reads that for *login* shells, so every command must do:
   ```bash
   source "$HOME/.cargo/env"
   ```
   A plain `command -v cargo` returns empty and will fool you into thinking Rust is missing.

2. **Screenshots are blocked.** `screencapture` fails with
   `could not create image from display` (no Screen Recording permission for the shell).
   **You cannot visually verify UI yourself.** AppleScript *does* work:
   ```bash
   osascript -e 'tell application "System Events" to tell process "Dorion" to get {position, size} of window 1'
   # -> 727, 379, 1179, 692
   ```

3. **There *was* no generic JS→Rust log command — there is one now.** `logger::log` existed in
   `src-tauri/src/util/logger.rs` but was **never registered** in `invoke_handler`, so probing
   from JS meant abusing a command that happened to log (e.g. `remove_top_bar`). This cost a
   whole debugging session, so a `js_log` command now exists (same file, registered in
   `main.rs`):

   ```ts
   window.__TAURI__.core.invoke('js_log', { message: 'anything' })
   // -> "[2026-10-10 20:38:30] [js] anything" in logs/latest.log
   ```

   **Use it rather than adding more ad-hoc `log!` lines.** It is currently registered but has
   no callers in-tree, so decide whether to keep it before committing.

4. **`flate!` embeds the JS bundles at COMPILE time — `cargo check` proves nothing.**
   `postinject_min.js` / `preinject_min.js` are baked into the binary by `include_flate`.
   If you edit injection code and then only run `cargo check`, you will launch the *old*
   binary and conclude your probe "didn't fire". This produced a completely false
   "the bundle never executes" diagnosis last session. After any `pnpm build:js`, you must
   `cargo build` and run `./src-tauri/target/debug/Dorion` (or `pnpm dev`).

5. **Toolchain present:** node v26.9.0, pnpm 12.4.1, clang (Xcode-beta), cmake 4.4.2.

6. **Storage:** `src-tauri/target` is **3.7 GB** (Rust debug artifacts). `cargo clean` reclaims it
   at the cost of a ~15 min full rebuild. `node_modules` 108 MB, `.scratch/` 4.8 MB.

## 4. Build & verify commands

```bash
cd /Users/chloe/desktop/developer/Dorion-V2
source "$HOME/.cargo/env"

pnpm install                 # JS deps
pnpm shupdate                # fetch shelter.js (230 KB) — needed before building
pnpm build:updater           # builds updater/ -> src-tauri/updater
pnpm build:js                # vite + esbuild -> preinject_min.js / postinject_min.js

cargo check --manifest-path src-tauri/Cargo.toml   # fast compile check (exit 0 = good)
pnpm clippy                                        # lint (upstream config: --no-default-features -D warnings)

pnpm build:js && cargo build --manifest-path src-tauri/Cargo.toml   # REQUIRED before testing
./src-tauri/target/debug/Dorion                   # run it (see §3.4 -- cargo check is not enough)

pnpm dev                     # = pnpm build:js && tauri dev  (long-running, launches the app)
```

`pnpm dev` is long-running → start it with the BACKGROUND process type and redirect to a log file.
The app launches fast (rebuilds of just the app crate took ~5 s). **Do not poll in long loops** —
start it, do one bounded wait, then check the log once.

Note: `pnpm clippy` **fails on macOS with 8 pre-existing errors** even on a pristine checkout
(unused vars in `notifications.rs`, dead `keyboard.rs` code, one collapsible `if`). Check
against a `git stash` baseline before assuming you introduced any.

Current state: the app builds and runs; `Removing top bar (set_decorations(false))` appears in
the log. Awaiting visual sign-off.

## 5. Bug #332 — the real root cause (this was the key discovery)

The custom titlebar is **not implemented in Dorion's code at all**. It ships as a remote
*shelter* plugin fetched at runtime from `spikehd.dev`. Its source:

```js
const onLoad = async () => {
  if (window?.__DORION_CONFIG__?.use_native_titlebar
      || await window?.__TAURI__?.core.invoke("get_platform") === "macos") return;
  // ...
  window?.__TAURI__?.core.invoke("remove_top_bar");
  injectControls();
  // ...
};
```

**The plugin deliberately bails out on macOS.** `get_platform()` returns `"macos"`
(`src-tauri/src/util/helpers.rs:67-76`). So on Mac it never calls `remove_top_bar`, never injects
its CSS, never draws window controls → native macOS titlebar stacks on top of Discord's header.
That *is* issue #332.

Consequence: **#332 is not a one-line un-stub.** It needs a macOS titlebar implemented.

Supporting facts:
- `remove_top_bar`'s macOS branch was a literal no-op: `pub fn remove_top_bar(_win: ...) {}`
  in `src-tauri/src/util/window_helpers.rs`.
- `set_decorations` was `#[cfg(not(target_os = "macos"))]` in `src-tauri/src/functionality/window.rs`
  **and** its registration in `src-tauri/src/main.rs` was gated the same way, so on macOS the
  frontend's `set_decorations` call (in `postinject.ts`, wrapped in `.catch()`) silently failed.
- On macOS, `set_decorations(false)` is **not** the wrong tool — see §6. It maps to
  `NSWindowStyleMask::Borderless | Resizable`, which is the desired result.
- Config flag `use_native_titlebar` (`src-tauri/src/config.rs`) defaults to **`false`**, i.e. the
  custom titlebar is the intended default.

## 6. Current work state — titlebar working, pending visual sign-off

The blocker from the last handoff is **resolved**. `remove_top_bar` now runs on macOS and the
plugin injects its controls. Working tree: 6 modified, 3 untracked.

### The two bugs that were actually blocking it

1. **Stale-binary red herring.** The "postinject never executes" conclusion was wrong: the last
   app run (20:18) predated the probes added at 20:20–20:22, and `flate!` embeds the bundle at
   *compile* time, so `cargo check` + a stale `target/debug/Clorion` can never show them.
   `get_injection_js` was called all along.

2. **The real one — `shelter` didn't exist yet.** The vendored plugin is bundled into
   postinject, which is `eval`'d during startup, long before the Shelter client mod boots.
   Upstream is fine because *Shelter* evaluates the plugin, so `window.shelter` already exists.
   Bundled in, the module body hit `const { util: { log } } = shelter` and
   `__toESM(require_web())` at module scope → `ReferenceError: Can't find variable: shelter`,
   which killed the **entire** postinject bundle (extra CSS, keybinds, themes — everything).
   Deferring only `injectCss`/`dispatcher` is not enough; the solid templates
   (`import_web$N.template(...)`) are also built at module scope. The whole body is now
   deferred into `__tbLoad()`, which runs on the first `onLoad()`/`onUnload()` call.

### Changes made

| File | Change |
|---|---|
| `src-tauri/injection/shared/dorion_titlebar.js` | **NEW** — vendored plugin. macOS bail-out removed; whole module body deferred behind `__tbLoad()`; `injectControls()` failure no longer swallowed. |
| `src-tauri/injection/preinject.ts` | Removed `'Dorion Titlebar'` from `SHELTER_INJECTOR_PLUGINS` so it can't double-load. |
| `src-tauri/injection/postinject.ts` | Waits for `window.shelter` (150 × 100 ms), then `titlebarPlugin.onLoad()`. |
| `src-tauri/src/util/window_helpers.rs` | `remove_top_bar` unified across platforms: plain `set_decorations(false)`. |
| `src-tauri/src/functionality/window.rs` | `set_decorations` un-gated; no macOS special case needed. |
| `src-tauri/src/main.rs` | Removed the `#[cfg(not(target_os = "macos"))]` gate on the `set_decorations` registration. |
| `src-tauri/src/util/logger.rs` | **NEW `js_log` command** — see §3.3. |
| `.gitignore` | Added `.scratch/`. |
| `docs/macos-issue-index.md` | **NEW** — full index of every macOS issue upstream (see §8). |

### Why `set_decorations(false)`, not `TitleBarStyle::Overlay`

The previous handoff assumed `set_decorations(false)` was wrong on macOS because it removes
the traffic lights. It is actually the correct call. In tao 0.36
(`platform_impl/macos/window.rs:1340`), `set_decorations(false)` →
`NSWindowStyleMask::Borderless | Resizable`: no title bar, no traffic lights, webview fills
the window — identical to Windows. Losing the traffic lights is the point, since the Dorion
titlebar draws its own minimise/maximise/close buttons.

`TitleBarStyle::Overlay` was implemented and tried first; it only sets
`titlebar_appears_transparent` + `fullsize_content_view`, so the traffic lights stay and
float over the **top-left of the content**, which is exactly where Discord renders its server
list. That looks worse than the original bug. `Transparent` is the same minus full-size
content, i.e. a blank strip. Neither is right.

### Verified

- ✅ `cargo build` and `pnpm build:js` clean; clippy back to the **8 pre-existing** upstream
  errors (checked against a `git stash` baseline — no new ones). eslint: 1 pre-existing warning.
- ✅ App boots; log shows `Removing top bar (set_decorations(false))`.
- ✅ Plugin injects: `e6P4KG_topright/topmin/topmax/topclose` are in the DOM inside Discord's
  channel bar, and `data-tauri-drag-region` is set on the channel title.
  (`.e6P4KG_dorion_topbar` is *absent* by design — the plugin's own `insertStandaloneControl`
  removes it once the channel bar exists, so the controls live in Discord's header.)
- ✅ `use_native_titlebar: true` restores the native frame (verified by flipping the config).
- ❌ **Not yet visually confirmed** — screenshots are blocked, so the user still has to eyeball it.

### If it looks wrong

The escape hatch is the config flag: `use_native_titlebar: true` in
`~/Library/Application Support/dorion/config.json` restores the native frame at runtime.

### What is verified vs. not

- ✅ Rust compiles clean (`cargo check` exit 0), and neither `remove_top_bar` nor
  `set_decorations` is flagged as dead code any more.
- ✅ `pnpm build:js` succeeds; the vendored plugin is bundled into `postinject_min.js`
  (2.4 KB → 15.0 KB) and the macOS guard is absent from the bundle.
- ✅ The bundle is a valid IIFE (`"use strict";(()=>{…})();`) — no stray ESM `export` that would
  break the `eval` that runs it.
- ✅ The app launches and stays alive, and `remove_top_bar` now fires at runtime.
- ❌ **Still not visually confirmed.** Everything below is log/DOM evidence only.

### How to verify the titlebar once the bundle runs

Because screenshots are blocked, use: (1) the `remove_top_bar` log marker, (2) AppleScript window
bounds, and (3) **ask the user to look at the window** — ultimately a visual judgement.

## 7. Open TODOs

1. **User eyeballs the window** and confirms #332 looks right.
2. Commit — nothing is committed yet.
3. Decide whether to keep `js_log` (see §3.3). It is currently registered but has no callers.
4. Remove the `upstream` remote (`git remote remove upstream`) to match the hard-fork decision.
5. Strip SpikeHD-specific links — `/.github/FUNDING.yml` points at `SpikeHD`'s PayPal.
6. `.github/workflows/publish-winget.yml` still targets the upstream winget identifier
   `SpikeHD.Dorion` — **disable this before touching CI** or it could publish under their package.

## 8. Other known macOS gaps (not started)

From `docs/macos-issue-index.md` (index of 427 upstream issues, 65 macOS-matching, 6 genuinely macOS):

- **No global keybinds / push-to-talk on macOS.** `src-tauri/src/functionality/mod.rs:7` gates
  `pub mod hotkeys` with `#[cfg(not(target_os = "macos"))]`. `Cargo.toml` comment:
  `# macOS does not support rpc and hotkeys lol`. README still advertises the feature.
- **No Rich Presence on macOS.** Same gate at `mod.rs:16`.
- **External images/fonts don't load on macOS.** Documented in README Known Issues. Cause: the MV3
  extension *"Dorion Header Destroyer"* (`src-tauri/extension/`) strips Discord's
  `content-security-policy` response header, but `load_extensions` is a stub on non-Windows
  (`src-tauri/src/functionality/extension.rs:101`, logs `Extensions are unsupported on non-Windows
  platforms!` — confirmed live in the app log). WKWebView has no extension API; would need
  `WKUserContentController`/`WKContentRuleList` or response interception.
- **Right-click → "Search with Google" opens Safari** (#395, overlaps #384). No custom context menu
  exists anywhere (`grep contextmenu src/` = 0 hits).
- **#377 Liquid Glass app icons** — cosmetic, needs Icon Composer / Xcode 26.

## 9. Reference data

- `docs/macos-issue-index.md` — the full indexed report.
- `.scratch/` (gitignored, 4.8 MB) — raw upstream issue dump: `issues.ndjson` (427 issues,
  82 PRs), `all_comments.ndjson` (1394 comment bodies), `mac_all.tsv` (65 macOS matches).
  Regenerable with `gh api`.
- `/tmp/dorion-titlebar-PRISTINE.js` — unmodified upstream copy of the vendored plugin, for
  re-diffing if the vendoring needs redoing.

---

## 10. Rename (done after the titlebar fix)

The project is now **Clorion**, maintained by ChloeVPin, forked from Dorion by SpikeHD.
Version reset to 0.1.0. `upstream` git remote removed. See the commit message for the full
list. Things that intentionally still say "Dorion":

- `window.Dorion`, `window.__DORION_CONFIG__`, `__DORION_INIT__`, `dorion-*` CSS ids and
  `data-dorion-platform` — these are the public plugin/theme API. Remote plugins and user
  themes read them; renaming breaks them.
- The `SHELTER_INJECTOR_PLUGINS` keys (`'Dorion Settings'`, `'Dorion Tray'`, ...) — these are
  the real names of plugins fetched from spikehd.dev.
- `https://spikehd.dev/shelter-plugins/*` URLs and the SpikeHD git dependencies in
  `Cargo.toml` — third-party origins the app still needs.

The data directory moved `%appdata%/dorion` -> `%appdata%/clorion`; the old folder on this
machine was renamed by hand so the Discord session survived.

Dev-only noise: `Failed to set application: CouldNotSet("com.chloevpin.clorion")` is expected.
`notify_rust::set_application` calls `LSCopyApplicationURLsForBundleIdentifier`, which only
succeeds once an app with that bundle id is actually installed. Harmless until then.

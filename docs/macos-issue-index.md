# macOS Issue Index

Index of every macOS-relevant issue from upstream [`SpikeHD/Dorion`](https://github.com/SpikeHD/Dorion),
cross-referenced against the Dorion-V2 codebase to see which ones still exist.

Upstream issues are **not** imported. This file is a read-only index; raw data lives in
`.scratch/` (gitignored).

## Method

| Step | Result |
|---|---|
| Issues scanned via REST (state=all, PRs excluded) | **427** (69 open, 358 closed) |
| Comments fetched for every issue and grepped locally | **1394** comment bodies |
| Matched macOS keywords in title/body/comments | **65** |
| — open | **12** |
| — closed | **53** |
| Open matches that are actually macOS | **6** (5 were keyword noise, 1 reclassified) |

Keyword set: `macos`, `mac`, `osx`, `darwin`, `apple`, `apple silicon`, `M1`–`M4`,
`big sur`, `monterey`, `ventura`, `sonoma`, `sequoia`, `tahoe`, `dmg`, `xattr`,
`quarantine`, `gatekeeper`, `notariz`, `codesign`, `homebrew`, `cask`, `wkwebview`,
`traffic light`, `menu bar`, `dock`, `.app`, `/Applications`, `Application Support`.

> Verdicts below are based on **code inspection**, not on running a macOS build.
> Items marked `needs hardware check` require an actual signed run on a Mac to confirm.

## Headline: one root cause gates most of this

Upstream never signs or notarises macOS builds.

- `src-tauri/tauri.conf.json` → `bundle.macOS.signingIdentity: "-"` (ad-hoc signing)
- `.github/workflows/build.yml` → builds `x86_64-apple-darwin` / `aarch64-apple-darwin`, **no signing or notarisation step**
- Issue **#509** *"[macOS] Add signing and notarisation support for releases"* was closed with:
  > "I will not be paying for an Apple developer account" — @SpikeHD, 2026-09-14

An ad-hoc signature is unstable across rebuilds, so macOS TCC (Privacy & Security) cannot
pin a permission grant to the app. That breaks microphone, camera, and WebAuthn — which is
#375, #394, and several closed media issues. **Fixing macOS properly starts here.**

---

## Open macOS issues

### #332 — Titlebar theming doesn't work (macOS 26 Tahoe) — **exists**
`https://github.com/SpikeHD/Dorion/issues/332`

Reporter sees the stock macOS titlebar with Discord's own titlebar stacked below it, and
CSS from #308 has no effect.

**Code evidence — this is unfixable by config today, the macOS path is stubbed out:**

```rust
// src-tauri/src/util/window_helpers.rs:126
// Top bar is broken for MacOS currently
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn remove_top_bar(_win: tauri::WebviewWindow) {}
```

```rust
// src-tauri/src/functionality/window.rs:24
#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn set_decorations(win: tauri::WebviewWindow, enable: bool) {
```

Both `remove_top_bar` and `set_decorations` are no-ops / compiled out on macOS, so the
native frame can never be hidden. Maintainer comment (2025-06-13): *"I will leave this open
as this has been asked for more than once now, so I may get to it eventually™"*.

**Fix:** real macOS branch — `set_decorations(false)` plus a transparent/overlay titlebar
(`titleBarStyle: Overlay`, `set_titlebar_style`, or an `NSWindow` titlebar hide via `objc2`).
Related closed issues that were all symptoms of the same gap: #304, #312, #376, #172.

---

### #375 — Voice and video non-working — **exists**
`https://github.com/SpikeHD/Dorion/issues/375`

Mic and camera both dead after granting permissions in System Settings; `Error: 3002` (audio),
`Camera Access Is Denied` (video). Open, labelled `help wanted`.

**Code evidence — the declarations exist, the signature does not:**

- `src-tauri/Info.plist` → `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` ✅
- `src-tauri/Entitlements.plist` → `com.apple.security.device.camera`, `...audio-input` ✅
- but `signingIdentity: "-"` and no notarisation ❌ — see headline above

Maintainer tried the Tauri mic fix (tauri-apps/tauri#11951) in a CI build; reporter
@glypse tested `aarch64-apple-darwin` and *"the issue persists."*

**Fix:** requires Developer ID signing + hardened runtime so TCC can bind the grant.
Entertainment entitlements alone do nothing without a stable signature.
`needs hardware check` to confirm once signed.

---

### #394 — Passkey sign-in doesn't work on macOS — **exists**
`https://github.com/SpikeHD/Dorion/issues/394`

"Or, sign in with passkey" does nothing. No comments on the issue.

**Code evidence:** `Entitlements.plist` contains no `com.apple.developer.associated-domains`
entry. WKWebView only exposes a WebAuthn platform authenticator when the app is signed and
declares `webcredentials:discord.com` in associated domains.

**Fix:** add the associated-domains entitlement + `webcredentials:discord.com`, and sign.
Depends on the same signing prerequisite as #375.

---

### #395 — "Search with Google" opens Safari instead of default browser — **exists**
`https://github.com/SpikeHD/Dorion/issues/395`

Highlight text → context menu → Search with Google → opens Safari even when e.g. Zen is default.

**Code evidence:** there is **no custom context menu anywhere** — `grep -rni "contextmenu"`
over `src/` returns zero hits. The menu shown is WKWebView's built-in one. Maintainer
(2025-12-30):

> "this is just what Discord does on the browser for some reason… [Vencord has a plugin for it]
> that I'd love to recreate, but it'd be difficult with shelter."

**Fix:** ship a custom context menu (webContextMenus-style) and suppress the native one,
then route links through `shell:allow-open`.

---

### #384 — Right-clicking highlighted text behaviour — **exists**
`https://github.com/SpikeHD/Dorion/issues/384`

Two symptoms: (1) right-clicking highlighted text gives no native menu at all — only works
in the composer; (2) "search with google" uses Safari.

**Verdict:** same root cause as #395, and the two overlap. Worth resolving together rather
than tracing separately.

---

### #377 — macOS Liquid Glass app icons — **not a bug, enhancement**
`https://github.com/SpikeHD/Dorion/issues/377`

Request to adopt macOS 26 Icon Composer (`.icon`) format. Requires Xcode 26 tooling.
Low priority; cosmetic.

---

### Reclassified: #397 — oversized "Add to Favorites" icon on GIF hover
`https://github.com/SpikeHD/Dorion/issues/397`

Reported on Tahoe 26.1, but the reporter later found the actual trigger:

> "I've noticed this bug happens when zoom is set smaller than default" — @shonjir

That makes it a zoom/CSS bug affecting all platforms, **not macOS-specific**. Dropped from
the macOS set.

---

### Keyword noise, not macOS
| # | Why it matched |
|---|---|
| #210 | Arch Linux — webkit2gtk / WebRTC |
| #243 | Flatpak — Linux |
| #328 | Linux CTRL-V paste |
| #364 | Windows 10 (macOS only mentioned in comments) |
| #426 | Windows 11 titlebar |

---

## Gaps the issue tracker missed

Not filed as issues. Found by reading the code while cross-checking the above. All three are
the same story: **the macOS port was started and never finished.**

### macOS has no global keybinds or push-to-talk
`src-tauri/src/functionality/mod.rs:7`

```rust
#[cfg(feature = "hotkeys")]
#[cfg(not(target_os = "macos"))]
pub mod hotkeys;
```

The module is compiled out on macOS. The maintainer's own comment in `Cargo.toml` says why:

```toml
[features]
# I would love to be able to specify default features by OS someday, because macOS
# does not support rpc and hotkeys lol
default = ["rpc", "blur", "hotkeys"]
```

`hotkeys` is a **default** feature — so it builds on Windows/Linux and silently vanishes on
macOS. Meanwhile the README advertises *"Global push-to-talk and custom keybinds"* under
Features, and the Platform Support table carries no row for it.

The keybind **config** types in `keyboard.rs` are still compiled on macOS, so settings UI
likely still renders — it just has nothing driving it. No issue exists for this.

**Fix direction:** a macOS hotkey backend, or swap to `tauri-plugin-global-shortcut` and drop
the `livesplit_hotkey` dependency for that platform.

### macOS has no Rich Presence
Same gate, `src-tauri/src/functionality/mod.rs:16` — `pub mod rpc` is `#[cfg(not(target_os = "macos"))]`.

README advertises *"Full RPC/game presence support included out of the box."* The Platform
Support table omits any RPC row, so the gap is unstated rather than documented.

### External images and fonts don't load on macOS
README **does** document this under Known Issues (lines 307-308), but no issue is open for it.

Root cause: Discord's responses carry a `content-security-policy` header that blocks
off-origin images. Dorion ships an MV3 extension, *"Dorion Header Destroyer"*
(`src-tauri/extension/`), whose entire job is to strip that header:

```json
{ "action": { "type": "modifyHeaders",
  "responseHeaders": [{ "header": "content-security-policy", "operation": "remove" }] } }
```

It loads via WebView2's `AddBrowserExtension`, which is Windows-only. The non-Windows
branch is a log-and-return stub:

```rust
// src-tauri/src/functionality/extension.rs:101
#[cfg(not(target_os = "windows"))]
pub fn load_extensions(_win: &WebviewWindow) {
  log!("Extensions are unsupported on non-Windows platforms!");
}
```

**Fix direction:** WKWebView has no extension API, but `WKUserContentController` +
`WKContentRuleList` can do the same blocking, and the dependency is already present —
`objc2-web-kit` is built with the `WKUserContentController` feature enabled. Intercepting
responses in the Tauri protocol handler is the alternative.

---

## Closed issues worth revisiting

These are closed upstream but the underlying gap may still be present in our tree.

| # | Title | Why it matters |
|---|---|---|
| **#509** | \[macOS] Add signing and notarisation support | **WONTFIX upstream.** We can do this. Unblocks #375 + #394. |
| #104 | macOS permission request spam | Closed; related to unstable signature — watch for regression |
| #267 | Minimised dock icon doesn't restore window | Tray/dock behaviour, `functionality/tray.rs` |
| #270 | Screen sharing not working on macOS | Labelled `upstream`; re-test once signed |
| #289 | Zhuyin IME double characters | IME handling, still no macOS-specific input code |
| #380 | Korean IME double characters | Same class as #289 |
| #372 / #293 | Cannot completely uninstall on macOS | Cached webview data + config paths |
| #456 | "Sudoless macOS versions — which are they?" | Distribution/packaging question |
| #442 | `localStorage` unavailable in changelog | Would break the same way on macOS |

---

## Suggested order

Signing, notarisation and anything gated behind them are **parked by decision** — they need a
paid Apple Developer account, which is out of scope for Dorion-V2.

1. **External images + fonts** — highest impact: affects every theme, background and avatar.
   Needs a WKWebView equivalent of the Windows header-stripping extension.
2. **Global keybinds / push-to-talk on macOS** — a README-advertised feature that is absent.
3. **Custom titlebar on macOS (#332)** — self-contained; the stub already marks the intent.
4. **Custom context menu (#395, #384)** — fixes two issues at once, all platforms.
5. **#377 Liquid Glass** — cosmetic, last.

**Parked:** #509 signing, and with it #375 (mic/camera) and #394 (passkeys).

One honest caveat on #375: the upstream Tauri resolution for the mic issue
(tauri-apps/tauri#11951) turned out to be *"build a production app rather than a dev build"* —
and Dorion already builds production, and already declares both the `Info.plist` usage strings
and the `Entitlements.plist` device entitlements. So the mic failure is **not** explained by
that fix. It may be fixable without paying Apple; worth one more look before writing it off.

## Raw data

```
.scratch/issues.ndjson        all 427 issues + 82 PRs, raw API rows
.scratch/all_comments.ndjson  1394 comment bodies
.scratch/mac_all.tsv          the 65 macOS keyword matches
```

Regenerate with the same filters to re-index after upstream activity.

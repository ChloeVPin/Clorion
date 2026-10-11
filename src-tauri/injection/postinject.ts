import { applyExtraCSS } from './shared/ui'
import { initWindowsKeybinds } from './shared/windows_keybinds'
import { initZoomHotkeys } from './shared/zoom'
import titlebarPlugin from './shared/dorion_titlebar'

// Runs the vendored Dorion titlebar plugin. Upstream this ships as a shelter injector
// plugin fetched from spikehd.dev, but that copy returns early when
// get_platform() === "macos", so the custom title bar never appeared on Mac.
//
// Each platform gets its own controls: macOS uses the real traffic lights (the Rust side
// switches the window to `TitleBarStyle::Overlay` for this), Windows/Linux use the
// plugin's drawn buttons. macOS still needs the plugin's drag region, because Overlay
// covers the native title bar with the webview.
async function initTitlebar() {
  // The plugin body reads `shelter` (and `shelter.solidWeb`) as soon as it is evaluated,
  // which is why it must not be evaluated before the Shelter client mod has booted. Wait
  // for Shelter, then hand control to the plugin.
  for (let i = 0; i < 150 && !(window as any).shelter; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  if (!(window as any).shelter) return

  const platform = document.documentElement.dataset.dorionPlatform

  try {
    if (platform === 'macos') {
      await window.__TAURI__.core.invoke('remove_top_bar')
      await titlebarPlugin.injectDragRegionOnly()
    } else {
      await titlebarPlugin.onLoad()
    }
  } catch (e) {
    console.error('[Clorion Titlebar] failed to load:', e)
  }
}

(async () => {
  console.log('Discord is loaded!')

  // Ensure top bar exists if we want it
  if (window.__DORION_CONFIG__.use_native_titlebar)
    window.__TAURI__.core.invoke('set_decorations', { enable: true }).catch(_e => { }) // This is allowed to fail

  initWindowsKeybinds()
  initZoomHotkeys()
  // Load up our extra css
  applyExtraCSS()

  // NOTE: deliberately not awaited. The plugin's macOS path waits on Discord's channel
  // header, which never appears on the login screen -- awaiting here hung the rest of this
  // bundle forever, which meant themes (injected at the bottom) silently never applied
  // until you were logged in. The plugin guards its own failures, so fire and forget.
  initTitlebar()

  // The comment ahead is read by tauri and used to insert theme injection code

  /*! __THEMES__ */
})()

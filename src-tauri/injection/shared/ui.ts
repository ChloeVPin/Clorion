import { waitForDom } from './util'

export function safemodeTimer(elm: HTMLDivElement) {
  setTimeout(() => {
    elm.classList.add('show')
  }, 10000)

  const tmpKeydown = (evt: KeyboardEvent) => {
    // If loading container doesn't exist, we made it through and should stop watching key events
    if (!document.querySelector('#loadingContainer')) {
      document.removeEventListener('keydown', tmpKeydown)
      return
    }

    // If spacebar, remove #loadingContainer
    if (evt.code === 'Space') {
      document.querySelector('#loadingContainer')?.remove()
    }

    // If F, open plugins folder
    if (evt.code === 'KeyF') {
      window.__TAURI__.core.invoke('open_themes')
    }

    // If S, relaunch once in safe mode.
    if (evt.code === 'KeyS') {
      window.__TAURI__.core.invoke('restart_in_safemode')
    }
  }

  document.addEventListener('keydown', tmpKeydown)
}

// Discord runs a seasonal app spinner on its loading screen. This is the Halloween 2026
// one (live 2026-10-07 -> 2026-11-02), pulled from Discord's own bundle. It is loaded from
// their CDN at runtime rather than vendored, the same as every other Discord asset we use.
//
// Only one usable URL is hardcoded, and the reason is worth recording:
//  - the "dark" asset (122274207f3e636d.webm) is served as a *uniform grey* frame -- every
//    one of its 35 frames decodes to the same flat colour, so it renders as a blank square.
//    That is Discord's file, unchanged, as of build 634304.
//  - the "light" asset (8ae88831d931e5a6.webm) is the real thing: an opaque black pumpkin
//    on an opaque white background, no alpha channel.
// So we use the light one and recolour it. `filter: invert(1)` turns the white plate black
// and the pumpkin white, which is what a dark-theme Discord spinner looks like, and the
// container's border-radius crops it to a circle.
//
// Both paths are build-hashed: once the event ends, or Discord ships a new build, they 404.
// The CSS fallback takes over when that happens, so this never hard-fails.
const SEASONAL_SPINNER = 'https://discord.com/assets/8ae88831d931e5a6.webm'

export async function initSpinner() {
  const container = document.querySelector('#spinner')

  if (!container) return

  const fallback = container.querySelector('.spinner__fallback')
  const video = container.querySelector('video')
  const canvas = container.querySelector('canvas')

  const showFallback = () => {
    video?.remove()
    canvas?.remove()
    fallback?.classList.add('show')
  }

  // Respect prefers-reduced-motion, same as Discord does with its own spinner.
  if (!video || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    showFallback()
    return
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const size = 112

  canvas.width = size
  canvas.height = size

  video.src = SEASONAL_SPINNER
  video.muted = true
  video.addEventListener('error', showFallback, { once: true })

  // Discord's asset is a solid black pumpkin on an opaque white plate, with no alpha.
  // Rather than fight `mix-blend-mode` (which WebKit composites unreliably for video, and
  // ends up leaking the white plate as a square around the disc), draw each frame into a
  // canvas and composite it ourselves: plate -> disc colour, pumpkin -> white. The canvas
  // ends up fully opaque and covers the video entirely.
  const DISC = [88, 101, 242] // #5865f2

  const draw = () => {
    // The splash is torn down after a second or so; stop looping once it is gone,
    // otherwise this rAF chain outlives the splash for the whole session.
    if (!container.isConnected) return

    if (ctx && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, size, size)

      const frame = ctx.getImageData(0, 0, size, size)
      const d = frame.data

      for (let i = 0; i < d.length; i += 4) {
        const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
        // lum 255 (plate) -> disc colour, lum 0 (pumpkin) -> white
        const t = 255 - lum

        d[i] = (255 * t + DISC[0] * (255 - t)) / 255
        d[i + 1] = (255 * t + DISC[1] * (255 - t)) / 255
        d[i + 2] = (255 * t + DISC[2] * (255 - t)) / 255
        d[i + 3] = 255
      }

      ctx.putImageData(frame, 0, 0)
    }

    requestAnimationFrame(draw)
  }

  video.play()
    .then(() => requestAnimationFrame(draw))
    .catch((e) => {
      // Worth keeping: once the seasonal event ends this URL 404s, and this is the only
      // clue that the fallback spinner is showing because Discord moved the asset.
      window.__TAURI__.core.invoke('js_log', { message: `[spinner] seasonal video unavailable, using fallback: ${e}` }).catch(() => { })
      showFallback()
    })
}
export async function applyExtraCSS() {
  const { invoke } = window.__TAURI__.core
  const css = await invoke('get_extra_css')
  const style = document.createElement('style')

  style.innerHTML = css
  style.id = 'dorion-extra-css'

  // Append some background-transparenting css if blur_css is true
  if (window.__DORION_CONFIG__.blur !== 'none' && window.__DORION_CONFIG__.blur_css) {
    style.innerHTML += `
      * {
        background: transparent !important;
      }
    `
  }

  document.body.appendChild(style)
}

export async function extraCssChangeWatch() {
  await waitForDom()
  const { event, core } = window.__TAURI__  

  const style = document.createElement('style')
  style.id = 'dorion-os-accent'

  const elm = document.body.appendChild(style)

  // Get the initial color
  const initial = await core.invoke('get_os_accent')
  const setAccentColor = (color: string) => {
    elm.innerText = `html { --os-accent-color: ${color} !important; }`
  }

  setAccentColor(initial)

  event.listen('os_accent_update', (event) => {
    setAccentColor(event.payload as string)
  })
}

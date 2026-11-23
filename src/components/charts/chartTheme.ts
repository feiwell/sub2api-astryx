/**
 * Chart styling for chart.js, derived from Astryx tokens.
 *
 * Series colours are Astryx data-viz ramp steps, picked per colour mode and
 * checked with the dataviz palette validator (adjacent-pair CVD + contrast):
 *   light (surface #fff):    blue #0171E3, orange #EB6E00, purple #6B1EFD, green #0B991F
 *   dark  (surface #262626): blue-3 #2694FE, orange-4 #D66100, pink-4 #D123A1, green #0B991F
 * Four line series pass on adjacent pairs only, so every multi-series chart
 * also carries a legend and direct end-of-line labels.
 */
import type { ColorMode } from '~/stores/app'

export const SERIES_COLORS: Record<ColorMode, readonly string[]> = {
  light: ['#0171E3', '#EB6E00', '#6B1EFD', '#0B991F'],
  dark: ['#2694FE', '#D66100', '#D123A1', '#0B991F'],
}

/** Single-hue "share" bars (one hue, magnitude). */
export const SHARE_COLOR: Record<ColorMode, string> = {
  light: '#0171E3',
  dark: '#2694FE',
}

export interface ChartInk {
  text: string
  muted: string
  grid: string
  surface: string
}

/** Resolve Astryx text/border/surface tokens to concrete colours (chart.js can't read CSS vars). */
export function readChartInk(el: Element | null): ChartInk {
  const fallback = { text: '#1b1b1b', muted: '#6b6b6b', grid: '#e5e5e5', surface: '#ffffff' }
  if (!el) return fallback
  const probe = document.createElement('span')
  probe.style.display = 'none'
  el.appendChild(probe)
  const resolve = (token: string, prop: 'color' | 'backgroundColor' | 'borderTopColor' = 'color') => {
    probe.style.color = ''
    probe.style.backgroundColor = ''
    probe.style.borderTopColor = ''
    probe.style[prop] = `var(${token})`
    return getComputedStyle(probe)[prop]
  }
  const ink = {
    text: resolve('--color-text-primary') || fallback.text,
    muted: resolve('--color-text-secondary') || fallback.muted,
    grid: resolve('--color-border', 'borderTopColor') || fallback.grid,
    surface: resolve('--color-background-surface', 'backgroundColor') || fallback.surface,
  }
  probe.remove()
  return ink
}

import type { ComponentType, SVGProps } from 'react'
import spriteUrl from './provider-logos.svg?no-inline'

export type ProviderBrand = ComponentType<SVGProps<SVGSVGElement>>

export function providerIcon(symbol: string): ProviderBrand {
  return function ProviderIcon(props) {
    return (
      <svg viewBox="0 0 24 24" focusable="false" {...props}>
        <use href={spriteUrl + '#' + symbol} />
      </svg>
    )
  }
}

export const CLAUDE = providerIcon('claude')
export const GPT = providerIcon('openai')
export const GEMINI = providerIcon('gemini')
export const ANTIGRAVITY = providerIcon('antigravity')

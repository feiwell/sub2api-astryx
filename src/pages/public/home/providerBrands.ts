import { providerInitials } from '~/lib/providerInitials'

export interface ProviderBrand {
  initials: string
}

export const CLAUDE: ProviderBrand = { initials: providerInitials('claude') }
export const GPT: ProviderBrand = { initials: providerInitials('gpt') }
export const GEMINI: ProviderBrand = { initials: providerInitials('gemini') }
export const ANTIGRAVITY: ProviderBrand = { initials: providerInitials('antigravity') }

import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ProviderMark } from './ProviderMark'

it.each(['openai', 'grok', 'anthropic', 'gemini', 'antigravity', 'kimi', 'zhipu', 'deepseek', 'minimax', 'opencode_go', 'cline', 'command_code', 'typesafe', ' GPT ', 'Claude', 'codex'])('renders the official mark for %s', (provider) => {
  const { container } = render(<ProviderMark provider={provider} />)
  expect(container.querySelector('[data-provider-mark] svg')).toBeInTheDocument()
  expect(container.querySelector('[data-provider-mark]')).toHaveAttribute('aria-hidden', 'true')
  expect(container.querySelector('[data-provider-mark]')).toHaveTextContent('')
})

it('keeps a letter fallback for custom or empty provider names', () => {
  const { rerender } = render(<ProviderMark provider=" Example " />)
  expect(screen.getByText('E')).toBeVisible()
  rerender(<ProviderMark provider="" />)
  expect(screen.getByText('?')).toBeVisible()
})

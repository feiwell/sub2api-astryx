import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { HomeLanding } from './HomeLanding'
import artwork from './provider-logos.svg?raw'

it('shows the provider marks on all four model cards and all three quick-start tabs', () => {
  const { container } = render(
    <MemoryRouter>
      <HomeLanding eyebrow="Gateway" startHref="/login" startLabel="Get started" />
    </MemoryRouter>,
  )
  const sprite = new DOMParser().parseFromString(artwork, 'image/svg+xml')
  const marks = [...container.querySelectorAll('svg use')]
  const idOf = (mark: Element) => mark.getAttribute('href')?.split('#')[1]
  expect(marks.filter(mark => !mark.closest('[role="tab"]')).map(idOf)).toEqual(['claude', 'openai', 'gemini', 'antigravity'])
  for (const [label, symbol] of [['Claude', 'claude'], ['GPT', 'openai'], ['Gemini', 'gemini']]) {
    const mark = screen.getByRole('tab', { name: label }).querySelector('use')
    expect(mark && idOf(mark)).toBe(symbol)
  }
  for (const mark of marks) {
    expect(mark.closest('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(sprite.getElementById(idOf(mark)!)?.querySelector('path')).toBeTruthy()
  }
})

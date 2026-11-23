import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ProviderMark } from './ProviderMark'

it('renders decorative initials for known and custom provider names', () => {
  const { rerender } = render(<ProviderMark provider="openai" />)
  expect(screen.getByText('OA').closest('[aria-hidden="true"]')).toBeInTheDocument()
  rerender(<ProviderMark provider=" Example " />)
  expect(screen.getByText('E')).toBeVisible()
  rerender(<ProviderMark provider="" />)
  expect(screen.getByText('?')).toBeVisible()
})

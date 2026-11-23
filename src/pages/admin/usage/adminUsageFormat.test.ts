import { describe, expect, it } from 'vitest'
import {
  USAGE_COLUMNS_VERSION,
  USAGE_HIDDEN_BY_DEFAULT,
  accountBilled,
  modelAudit,
  modelSteps,
  sentUpstreamModel,
  startingHiddenColumns,
} from './adminUsageFormat'

describe('what the account is charged', () => {
  it('is the standard price times the rate of the account', () => {
    expect(accountBilled({ total_cost: 0.5, account_rate_multiplier: 0.8 })).toBeCloseTo(0.4, 10)
  })

  it('starts from the cost of the account\'s own pricing rules where there is one, a free one too', () => {
    expect(accountBilled({ total_cost: 0.5, account_stats_cost: 0.2, account_rate_multiplier: 2 })).toBeCloseTo(0.4, 10)
    expect(accountBilled({ total_cost: 0.5, account_stats_cost: 0, account_rate_multiplier: 2 })).toBe(0)
  })

  it('takes an account without a rate as charged the price itself', () => {
    expect(accountBilled({ total_cost: 0.5 })).toBe(0.5)
    expect(accountBilled({ total_cost: 0.5, account_stats_cost: null, account_rate_multiplier: null })).toBe(0.5)
  })

  it('is zero rather than not-a-number for a row that carries no usable figures', () => {
    expect(accountBilled({ total_cost: Number.NaN, account_rate_multiplier: 1 })).toBe(0)
  })
})

describe('the models of a request', () => {
  it('is the one asked for when nothing was mapped', () => {
    expect(modelSteps({ model: 'gpt-5' })).toEqual(['gpt-5'])
    expect(modelSteps({ model: 'gpt-5', upstream_model: 'gpt-5' })).toEqual(['gpt-5'])
    expect(modelSteps({ model: 'gpt-5', upstream_model: null, model_mapping_chain: '' })).toEqual(['gpt-5'])
  })

  it('adds the one sent upstream when it is another', () => {
    expect(modelSteps({ model: 'sonnet', upstream_model: 'claude-sonnet-4-5' })).toEqual(['sonnet', 'claude-sonnet-4-5'])
  })

  it('follows the whole mapping chain when the server recorded one', () => {
    expect(
      modelSteps({ model: 'sonnet', upstream_model: 'claude-sonnet-4-5', model_mapping_chain: 'sonnet → claude-sonnet-4 → claude-sonnet-4-5' }),
    ).toEqual(['sonnet', 'claude-sonnet-4', 'claude-sonnet-4-5'])
    // A chain of one name is no mapping.
    expect(modelSteps({ model: 'sonnet', model_mapping_chain: 'sonnet' })).toEqual(['sonnet'])
  })

  it('names what was sent upstream', () => {
    expect(sentUpstreamModel({ model: 'sonnet', upstream_model: ' claude-sonnet-4-5 ' })).toBe('claude-sonnet-4-5')
    expect(sentUpstreamModel({ model: 'sonnet', upstream_model: '' })).toBe('sonnet')
    expect(sentUpstreamModel({ model: 'sonnet' })).toBe('sonnet')
  })
})

describe('an upstream that answered as another model', () => {
  const flagged = (sent: string, answered: string) =>
    modelAudit({ model: 'asked', upstream_model: sent, upstream_response_model: answered, upstream_model_mismatch: true })

  it('is nothing to show unless the server flagged it and named the model', () => {
    expect(modelAudit({ model: 'gpt-5' })).toBeNull()
    expect(modelAudit({ model: 'gpt-5', upstream_response_model: 'gpt-4o', upstream_model_mismatch: false })).toBeNull()
    expect(modelAudit({ model: 'gpt-5', upstream_response_model: 'gpt-4o', upstream_model_mismatch: null })).toBeNull()
    expect(modelAudit({ model: 'gpt-5', upstream_response_model: ' ', upstream_model_mismatch: true })).toBeNull()
  })

  it('is a variant when the two names are releases of one model', () => {
    expect(flagged('claude-sonnet-4-5', 'claude-sonnet-4-5-20250929')).toBe('variant')
    expect(flagged('gpt-4o', 'gpt-4o-2024-08-06')).toBe('variant')
    expect(flagged('gemini-pro-latest', 'Gemini-Pro')).toBe('variant')
  })

  it('is a mismatch when they are different models', () => {
    expect(flagged('gpt-5', 'gpt-4o')).toBe('mismatch')
    expect(flagged('claude-sonnet-4-5', 'claude-sonnet-4-20250514')).toBe('mismatch')
  })

  it('compares with the model asked for when nothing was mapped', () => {
    expect(modelAudit({ model: 'gpt-4o', upstream_response_model: 'gpt-4o-2024-08-06', upstream_model_mismatch: true })).toBe(
      'variant',
    )
  })
})

describe('the hidden columns a browser starts from', () => {
  it('are the defaults when no choice is stored', () => {
    expect(startingHiddenColumns(null, null)).toEqual(USAGE_HIDDEN_BY_DEFAULT)
    expect(startingHiddenColumns(null, USAGE_COLUMNS_VERSION)).toEqual(USAGE_HIDDEN_BY_DEFAULT)
  })

  it('are the stored choice when it is up to date, a choice to show everything too', () => {
    expect(startingHiddenColumns(['tokens'], USAGE_COLUMNS_VERSION)).toEqual(['tokens'])
    expect(startingHiddenColumns([], USAGE_COLUMNS_VERSION)).toEqual([])
  })

  it('hide both request-id columns once for a choice made before either existed', () => {
    expect(startingHiddenColumns(['user_agent'], null)).toEqual(['user_agent', 'request_id', 'upstream_request_id'])
    expect(startingHiddenColumns([], 'something-older')).toEqual(['request_id', 'upstream_request_id'])
  })

  it('hide only the newer column for a choice made after the first one was added', () => {
    // The request id was shown on purpose; it stays shown.
    expect(startingHiddenColumns(['user_agent'], 'request-id-hidden-by-default')).toEqual([
      'user_agent',
      'upstream_request_id',
    ])
  })

  it('do not list a column twice', () => {
    expect(startingHiddenColumns(['request_id', 'upstream_request_id'], null)).toEqual(['request_id', 'upstream_request_id'])
  })
})

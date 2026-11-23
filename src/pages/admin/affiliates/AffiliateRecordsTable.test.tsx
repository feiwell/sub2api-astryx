import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { LayerProvider } from '@astryxdesign/core/Layer'
import { AffiliateRecordsTable } from './AffiliateRecordsTable'

const {
  mockListTransfers,
  mockListInvites,
  mockListRebates,
  mockLookupUsers,
  mockGetUserOverview,
  mockWithdraw,
} = vi.hoisted(() => ({
  mockListTransfers: vi.fn(),
  mockListInvites: vi.fn(),
  mockListRebates: vi.fn(),
  mockLookupUsers: vi.fn(),
  mockGetUserOverview: vi.fn(),
  mockWithdraw: vi.fn(),
}))

vi.mock('~/lib/api/admin', () => ({
  adminAPI: {
    affiliates: {
      listInviteRecords: mockListInvites,
      listRebateRecords: mockListRebates,
      listTransferRecords: mockListTransfers,
      lookupUsers: mockLookupUsers,
      getUserOverview: mockGetUserOverview,
      withdrawUserQuota: mockWithdraw,
    },
  },
}))

// jsdom has no <dialog> support.
beforeEach(() => {
  const proto = window.HTMLDialogElement?.prototype as
    | (HTMLDialogElement & { showModal?: () => void; close?: () => void })
    | undefined
  if (proto && !proto.showModal) {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true
    }
    proto.close = function close(this: HTMLDialogElement) {
      this.open = false
    }
  }
})

/**
 * Queries the Vue-compatible `data-test` hooks without calling
 * testing-library's global `configure`, which would leak into other suites.
 */
function byTest(name: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-test="${name}"]`)
  if (!el) throw new Error(`no [data-test="${name}"]`)
  return el
}

async function findByTest(name: string): Promise<HTMLElement> {
  return waitFor(() => byTest(name))
}

function wrap(node: React.ReactNode) {
  return (
    <Theme theme={neutralTheme} mode="light">
      <LayerProvider>{node}</LayerProvider>
    </Theme>
  )
}

describe('AffiliateRecordsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListInvites.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, pages: 0 })
    mockListRebates.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, pages: 0 })
    mockListTransfers.mockResolvedValue({
      items: [
        {
          ledger_id: 7,
          action: 'withdraw',
          user_id: 42,
          user_email: 'a@b.c',
          username: 'alice',
          amount: 12.5,
          balance_after: null,
          available_quota_after: 3,
          frozen_quota_after: 0,
          history_quota_after: 15.5,
          snapshot_available: true,
          created_at: '2024-05-01T10:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      pages: 1,
    })
    mockLookupUsers.mockResolvedValue([{ id: 42, email: 'a@b.c', username: 'alice' }])
    mockGetUserOverview.mockResolvedValue({
      user_id: 42,
      email: 'a@b.c',
      username: 'alice',
      aff_code: 'ABC',
      rebate_rate_percent: 12.5,
      invited_count: 3,
      rebated_invitee_count: 2,
      available_quota: 9.5,
      history_quota: 20,
    })
    mockWithdraw.mockResolvedValue({
      result: {
        ledger_id: 8,
        user_id: 42,
        amount: 9.5,
        available_quota_after: 0,
        frozen_quota_after: 0,
        history_quota_after: 20,
      },
      replayed: false,
    })
  })

  it('renders invites and rebates', async () => {
    const invites = render(wrap(<AffiliateRecordsTable type="invites" />))
    await waitFor(() => expect(mockListInvites).toHaveBeenCalled())
    invites.unmount()

    render(wrap(<AffiliateRecordsTable type="rebates" />))
    await waitFor(() => expect(mockListRebates).toHaveBeenCalled())
  })

  it('loads transfers, opens the withdraw dialog and submits', async () => {
    const user = userEvent.setup()
    render(wrap(<AffiliateRecordsTable type="transfers" />))

    await waitFor(() => expect(mockListTransfers).toHaveBeenCalled())
    expect(mockListTransfers.mock.calls[0][0]).toMatchObject({
      page: 1,
      sort_by: 'created_at',
      sort_order: 'desc',
    })
    await screen.findByText('a@b.c')

    await user.click(byTest('affiliate-withdraw-open'))
    const search = await findByTest('withdraw-user-search')
    await user.type(search, 'alice')
    await waitFor(() => expect(mockLookupUsers).toHaveBeenCalledWith('alice'), { timeout: 2000 })

    const option = await waitFor(() => {
      const found = document.querySelectorAll<HTMLElement>('[data-test="withdraw-user-option"]')
      if (found.length === 0) throw new Error('no user options')
      return found[0]
    })
    await user.click(option)

    await waitFor(() => expect(mockGetUserOverview).toHaveBeenCalledWith(42))
    await findByTest('withdraw-available-quota')

    await user.click(byTest('withdraw-fill-all'))
    await user.click(byTest('withdraw-submit'))

    await waitFor(() => expect(mockWithdraw).toHaveBeenCalled())
    expect(mockWithdraw.mock.calls[0][1]).toEqual({ amount: 9.5 })
    expect(typeof mockWithdraw.mock.calls[0][2]).toBe('string')
  })

  it('opens the user overview dialog from a clickable user cell', async () => {
    const user = userEvent.setup()
    mockListInvites.mockResolvedValue({
      items: [
        {
          inviter_id: 1,
          inviter_email: 'inv@x.y',
          inviter_username: 'inv',
          invitee_id: 2,
          invitee_email: 'ee@x.y',
          invitee_username: 'ee',
          aff_code: 'CODE',
          total_rebate: 4.25,
          created_at: '2024-05-01T10:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      pages: 1,
    })
    render(wrap(<AffiliateRecordsTable type="invites" />))
    const link = await screen.findByText('inv@x.y')
    await user.click(link)
    await waitFor(() => expect(mockGetUserOverview).toHaveBeenCalledWith(1))
    await screen.findByText('CODE')
  })
})

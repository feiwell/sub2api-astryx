import { toAppPath } from '@/utils/appPath'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { Button } from '@astryxdesign/core/Button'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Grid } from '@astryxdesign/core/Grid'
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Center } from '@astryxdesign/core/Center'
import {
  UserGroupIcon,
  CurrencyDollarIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'
import { userAPI } from '@/api'
import type { UserAffiliateDetail } from '@/types'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { copyToClipboard } from '~/lib/clipboard'
import { useAuthStore } from '~/stores/auth'

function formatCurrency(value: number): string {
  return `$${(value || 0).toFixed(2)}`
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function formatDateTime(timestamp: string | number | undefined): string {
  if (!timestamp) return '-'
  const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp)
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

interface InviteeRow extends Record<string, unknown> {
  __id: string
  user_id: number
  email: string
  username: string
  total_rebate: number
  created_at: string | number
}

function StatCard({
  icon,
  label,
  value,
  detail,
  valueColor,
}: {
  icon: typeof CurrencyDollarIcon
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  valueColor?: 'primary' | 'success'
}) {
  return (
    <Card padding={5}>
      <VStack gap={2} hAlign="stretch">
        <HStack gap={1.5} vAlign="center">
          <Icon icon={icon} color="primary" />
          <Text type="supporting" color="secondary">
            {label}
          </Text>
        </HStack>
        <Text
          type="body"
          size="xl"
          weight="semibold"
          color={valueColor as any}
          hasTabularNumbers>
          {value}
        </Text>
        {detail && (
          <Text type="supporting" color="secondary">
            {detail}
          </Text>
        )}
      </VStack>
    </Card>
  )
}

export function AffiliatePage() {
  const { t } = useI18n()
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const [loading, setLoading] = useState(true)
  const [transferring, setTransferring] = useState(false)
  const [detail, setDetail] = useState<UserAffiliateDetail | null>(null)

  const inviteLink = (() => {
    if (!detail) return ''
    if (typeof window === 'undefined') return `/register?aff=${encodeURIComponent(detail.aff_code)}`
    return `${window.location.origin}${toAppPath('/register')}?aff=${encodeURIComponent(detail.aff_code)}`
  })()

  const formattedRebateRate = (() => {
    const v = detail?.effective_rebate_rate_percent ?? 0
    const rounded = Math.round(v * 100) / 100
    return Number.isInteger(rounded) ? String(rounded) : rounded.toString()
  })()

  const loadAffiliateDetail = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    try {
      const data = await userAPI.getAffiliateDetail()
      setDetail(data)
    } catch (error: unknown) {
      const message = (error as { message?: string }).message
      toast.error(message || t('affiliate.loadFailed'))
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [t])

  useEffect(() => {
    void loadAffiliateDetail()
  }, [loadAffiliateDetail])

  const handleCopyCode = async () => {
    if (!detail?.aff_code) return
    try {
      await copyToClipboard(detail.aff_code)
      toast.success(t('affiliate.codeCopied'))
    } catch (error) {
      toast.error(t('common.copyFailed'))
    }
  }

  const handleCopyLink = async () => {
    if (!inviteLink) return
    try {
      await copyToClipboard(inviteLink)
      toast.success(t('affiliate.linkCopied'))
    } catch (error) {
      toast.error(t('common.copyFailed'))
    }
  }

  const handleTransfer = async () => {
    if (!detail || detail.aff_quota <= 0 || transferring) return
    setTransferring(true)
    try {
      const resp = await userAPI.transferAffiliateQuota()
      toast.success(t('affiliate.transfer.success', { amount: formatCurrency(resp.transferred_quota) }))
      await Promise.all([
        loadAffiliateDetail(true),
        refreshUser().catch(() => undefined),
      ])
    } catch (error: unknown) {
      const message = (error as { message?: string }).message
      toast.error(message || t('affiliate.transferFailed'))
    } finally {
      setTransferring(false)
    }
  }

  const inviteeRows: InviteeRow[] = useMemo(
    () =>
      (detail?.invitees || []).map((item) => ({
        __id: String(item.user_id),
        user_id: item.user_id,
        email: item.email,
        username: item.username,
        total_rebate: item.total_rebate,
        created_at: item.created_at,
      })) as InviteeRow[],
    [detail],
  )

  const inviteeColumns = useMemo<TableColumn<InviteeRow>[]>(
    () => [
      {
        key: 'email',
        header: t('affiliate.invitees.columns.email'),
        width: proportional(2, { minWidth: 180 }),
        renderCell: (row) => (
          <Text type="body">
            {row.email || '-'}
          </Text>
        ),
      },
      {
        key: 'username',
        header: t('affiliate.invitees.columns.username'),
        width: proportional(1.5, { minWidth: 120 }),
        renderCell: (row) => (
          <Text type="body" color="secondary">
            {row.username || '-'}
          </Text>
        ),
      },
      {
        key: 'total_rebate',
        header: t('affiliate.invitees.columns.rebate'),
        width: proportional(1, { minWidth: 100 }),
        align: 'end',
        renderCell: (row) => (
          <Text type="body" weight="medium" color={"success" as any} hasTabularNumbers>
            {formatCurrency(row.total_rebate)}
          </Text>
        ),
      },
      {
        key: 'created_at',
        header: t('affiliate.invitees.columns.joinedAt'),
        width: proportional(1.5, { minWidth: 140 }),
        renderCell: (row) => (
          <Text type="body" color="secondary">
            {formatDateTime(row.created_at)}
          </Text>
        ),
      },
    ],
    [t],
  )

  if (loading) {
    return (
      <Page title={t('affiliate.title')} description="">
        <Center padding={8}>
          <Spinner />
        </Center>
      </Page>
    )
  }

  if (!detail) {
    return (
      <Page title={t('affiliate.title')} description="">
        <Center padding={8}>
          <Text type="body" color="secondary">
            {t('affiliate.loadFailed')}
          </Text>
        </Center>
      </Page>
    )
  }

  return (
    <Page title={t('affiliate.title')} description="">
      <VStack gap={4} hAlign="stretch">
        {/* Statistics Cards */}
        <Grid columns={"repeat(auto-fit, minmax(240px, 1fr))" as any} gap={4}>
          <StatCard
            icon={CurrencyDollarIcon}
            label={t('affiliate.stats.rebateRate')}
            value={
              <>
                {formattedRebateRate}
                <Text type="body" weight="normal" as="span">
                  %
                </Text>
              </>
            }
            detail={t('affiliate.stats.rebateRateHint')}
            valueColor="primary"
          />
          <StatCard
            icon={UserGroupIcon}
            label={t('affiliate.stats.invitedUsers')}
            value={formatCount(detail.aff_count)}
          />
          <StatCard
            icon={BanknotesIcon}
            label={t('affiliate.stats.availableQuota')}
            value={formatCurrency(detail.aff_quota)}
            valueColor="success"
          />
          <StatCard
            icon={CurrencyDollarIcon}
            label={t('affiliate.stats.totalQuota')}
            value={formatCurrency(detail.aff_history_quota)}
            detail={
              detail.aff_frozen_quota > 0
                ? `${t('affiliate.stats.frozenQuota')}: ${formatCurrency(detail.aff_frozen_quota)}`
                : undefined
            }
          />
        </Grid>

        {/* Affiliate Info Section */}
        <Card padding={6}>
          <VStack gap={5} hAlign="stretch">
            <VStack gap={1} hAlign="stretch">
              <Text type="body" weight="semibold">
                {t('affiliate.title')}
              </Text>
              <Text type="body" color="secondary">
                {t('affiliate.description')}
              </Text>
            </VStack>

            <Grid columns={"repeat(auto-fit, minmax(280px, 1fr))" as any} gap={4}>
              <VStack gap={2} hAlign="stretch">
                <Text type="body" weight="medium" color="secondary">
                  {t('affiliate.yourCode')}
                </Text>
                <Card padding={3} variant={"secondary" as any}>
                  <HStack gap={2} vAlign="center" hAlign="between">
                    <Text type="body" weight="semibold" as={"code" as any}>
                      {detail.aff_code}
                    </Text>
                    <Button
                      label={t('affiliate.copyCode')}
                      variant={"secondary" as any}
                     
                      onClick={handleCopyCode}
                    />
                  </HStack>
                </Card>
              </VStack>

              <VStack gap={2} hAlign="stretch">
                <Text type="body" weight="medium" color="secondary">
                  {t('affiliate.inviteLink')}
                </Text>
                <Card padding={3} variant={"secondary" as any}>
                  <HStack gap={2} vAlign="center" hAlign="between">
                    <Text type="body" color="secondary" as={"code" as any}>
                      {inviteLink}
                    </Text>
                    <Button
                      label={t('affiliate.copyLink')}
                      variant={"secondary" as any}
                     
                      onClick={handleCopyLink}
                    />
                  </HStack>
                </Card>
              </VStack>
            </Grid>

            {/* Tips Section */}
            <Card padding={4} variant={"info" as any}>
              <VStack gap={2} hAlign="stretch">
                <Text type="body" weight="medium" color="primary">
                  {t('affiliate.tips.title')}
                </Text>
                <VStack gap={1} hAlign="stretch">
                  <Text type="body" color="primary">
                    1. {t('affiliate.tips.line1')}
                  </Text>
                  <Text type="body" color="primary">
                    2. {t('affiliate.tips.line2', { rate: `${formattedRebateRate}%` })}
                  </Text>
                  <Text type="body" color="primary">
                    3. {t('affiliate.tips.line3')}
                  </Text>
                  {detail.aff_frozen_quota > 0 && (
                    <Text type="body" color="primary">
                      4. {t('affiliate.tips.line4')}
                    </Text>
                  )}
                </VStack>
              </VStack>
            </Card>
          </VStack>
        </Card>

        {/* Transfer Quota Section */}
        <Card padding={6}>
          <VStack gap={3} hAlign="stretch">
            <HStack gap={3} vAlign="start" hAlign="between" wrap="wrap">
              <VStack gap={1} hAlign="stretch">
                <Text type="body" weight="semibold">
                  {t('affiliate.transfer.title')}
                </Text>
                <Text type="body" color="secondary">
                  {t('affiliate.transfer.description')}
                </Text>
              </VStack>
              <Button
                label={transferring ? t('affiliate.transfer.transferring') : t('affiliate.transfer.button')}
                variant="primary"
                isDisabled={transferring || detail.aff_quota <= 0}
                onClick={handleTransfer}
              />
            </HStack>
            {detail.aff_quota <= 0 && (
              <Text type="body" color={"warning" as any}>
                {t('affiliate.transfer.empty')}
              </Text>
            )}
          </VStack>
        </Card>

        {/* Invitees List Section */}
        <Card padding={6}>
          <VStack gap={4} hAlign="stretch">
            <Text type="body" weight="semibold">
              {t('affiliate.invitees.title')}
            </Text>

            {inviteeRows.length === 0 ? (
              <Card padding={6} variant={"neutral" as any}>
                <Center>
                  <Text type="body" color="secondary">
                    {t('affiliate.invitees.empty')}
                  </Text>
                </Center>
              </Card>
            ) : (
              <Card>
                <Table data={inviteeRows} columns={inviteeColumns} idKey="__id" />
              </Card>
            )}
          </VStack>
        </Card>
      </VStack>
    </Page>
  )
}

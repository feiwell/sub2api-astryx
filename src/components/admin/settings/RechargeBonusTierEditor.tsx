import { useCallback, useId, useMemo } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Field } from '@astryxdesign/core/Field'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Token } from '@astryxdesign/core/Token'
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'

const MAX_RECHARGE_BONUS_TIERS = 10
const MAX_RECHARGE_BONUS_PERCENT = 1000

export type RechargeBonusMode = 'bonus' | 'discount'

export interface RechargeBonusTierDraft {
  min_amount: number | null
  bonus_percent: number | null
}

interface RechargeBonusInterval {
  from: number
  to: number | null
  percent: number
}

interface RechargeBonusTierIssue {
  field: keyof RechargeBonusTierDraft
  message: string
}

interface RechargeBonusTierEditorProps {
  tiers: RechargeBonusTierDraft[]
  mode: RechargeBonusMode
  notice: string
  onTiersChange: (tiers: RechargeBonusTierDraft[]) => void
  onModeChange: (mode: RechargeBonusMode) => void
  onNoticeChange: (notice: string) => void
}

function toTierNumber(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function RechargeBonusTierEditor({
  tiers,
  mode,
  notice,
  onTiersChange,
  onModeChange,
  onNoticeChange,
}: RechargeBonusTierEditorProps) {
  const { t } = useI18n()
  const modeGroupID = useId()

  const modeOptions = useMemo(() => [
    { value: 'bonus' as const, label: t('admin.settings.payment.rechargeBonus.modeBonus') },
    { value: 'discount' as const, label: t('admin.settings.payment.rechargeBonus.modeDiscount') },
  ], [t])

  const addTier = useCallback(() => {
    if (tiers.length >= MAX_RECHARGE_BONUS_TIERS) return
    onTiersChange([...tiers, { min_amount: null, bonus_percent: null }])
  }, [tiers, onTiersChange])

  const removeTier = useCallback((index: number) => {
    const next = [...tiers]
    next.splice(index, 1)
    onTiersChange(next)
  }, [tiers, onTiersChange])

  const updateMinAmount = useCallback((index: number, value: number | null) => {
    const next = [...tiers]
    next[index] = { ...next[index], min_amount: toTierNumber(value) }
    onTiersChange(next)
  }, [tiers, onTiersChange])

  const updatePercent = useCallback((index: number, value: number | null) => {
    const next = [...tiers]
    next[index] = { ...next[index], bonus_percent: toTierNumber(value) }
    onTiersChange(next)
  }, [tiers, onTiersChange])

  const sanitizedTiers = useMemo((): RechargeBonusInterval[] => {
    const valid = tiers
      .filter(t => t.min_amount !== null && t.bonus_percent !== null && t.min_amount >= 0)
      .map(t => ({ min_amount: t.min_amount!, bonus_percent: t.bonus_percent! }))
      .sort((a, b) => a.min_amount - b.min_amount)

    const intervals: RechargeBonusInterval[] = []
    for (let i = 0; i < valid.length; i++) {
      const current = valid[i]
      const next = valid[i + 1]
      intervals.push({
        from: current.min_amount,
        to: next ? next.min_amount : null,
        percent: current.bonus_percent,
      })
    }
    return intervals
  }, [tiers])

  const formatNumber = (n: number) => {
    return n % 1 === 0 ? n.toString() : n.toFixed(2)
  }

  const intervalLabel = (interval: RechargeBonusInterval): string => {
    const from = formatNumber(interval.from)
    const percent = formatNumber(interval.percent)
    const discount = mode === 'discount'

    if (interval.to === null) {
      if (interval.percent <= 0) return t('admin.settings.payment.rechargeBonus.previewOpenNone', { from })
      return discount
        ? t('admin.settings.payment.rechargeBonus.previewOpenDiscount', { from, percent })
        : t('admin.settings.payment.rechargeBonus.previewOpen', { from, percent })
    }

    const to = formatNumber(interval.to)
    if (interval.percent <= 0) return t('admin.settings.payment.rechargeBonus.previewRangeNone', { from, to })
    return discount
      ? t('admin.settings.payment.rechargeBonus.previewRangeDiscount', { from, to, percent })
      : t('admin.settings.payment.rechargeBonus.previewRange', { from, to, percent })
  }

  const rowIssue = (index: number): RechargeBonusTierIssue | null => {
    const tier = tiers[index]
    if (!tier) return null

    if (tier.min_amount !== null && tier.min_amount < 0) {
      return { field: 'min_amount', message: t('admin.settings.payment.rechargeBonus.invalidMinAmount') }
    }
    if (tier.bonus_percent !== null) {
      if (mode === 'discount' && (tier.bonus_percent < 0 || tier.bonus_percent >= 100)) {
        return { field: 'bonus_percent', message: t('admin.settings.payment.rechargeBonus.invalidDiscountPercent') }
      }
      if (tier.bonus_percent < 0 || tier.bonus_percent > MAX_RECHARGE_BONUS_PERCENT) {
        return { field: 'bonus_percent', message: t('admin.settings.payment.rechargeBonus.invalidPercent') }
      }
    }

    // Check for duplicates
    if (tier.min_amount !== null) {
      const duplicates = tiers.filter((t, i) => i !== index && t.min_amount === tier.min_amount)
      if (duplicates.length > 0) {
        return { field: 'min_amount', message: t('admin.settings.payment.rechargeBonus.duplicateMinAmount') }
      }
    }

    return null
  }

  const rowIncomplete = (index: number): boolean => {
    const tier = tiers[index]
    return tier && (tier.min_amount === null || tier.bonus_percent === null)
  }

  return (
    <VStack gap={4} hAlign="stretch">
      <Field
        label={t('admin.settings.payment.rechargeBonus.modeLabel')}
        inputID={modeGroupID}
        isGroupLabel
      >
        <VStack gap={2}>
          <SegmentedControl
            label={t('admin.settings.payment.rechargeBonus.modeLabel')}
            value={mode}
            onChange={(value) => onModeChange(value as RechargeBonusMode)}
          >
            {modeOptions.map(option => (
              <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
            ))}
          </SegmentedControl>
          <Text type="supporting" color="secondary">
            {mode === 'discount'
              ? t('admin.settings.payment.rechargeBonus.modeDiscountHint')
              : t('admin.settings.payment.rechargeBonus.modeBonusHint')}
          </Text>
        </VStack>
      </Field>

      {tiers.length === 0 ? (
        <Text type="supporting" color="secondary">
          {t('admin.settings.payment.rechargeBonus.empty')}
        </Text>
      ) : (
        <VStack gap={2} hAlign="stretch">
          {tiers.map((tier, index) => {
            const issue = rowIssue(index)
            return (
              <VStack key={index} gap={1} hAlign="stretch">
                <HStack gap={2} vAlign="end">
                  <StackItem size="fill">
                    <Grid columns={2} gap={2}>
                      <NumberInput
                        label={t('admin.settings.payment.rechargeBonus.minAmountLabel')}
                        isLabelHidden={index > 0}
                        value={tier.min_amount}
                        onChange={(value) => updateMinAmount(index, value)}
                        step={0.01}
                        placeholder="100"
                        status={issue?.field === 'min_amount' ? { type: 'error' } : undefined}
                        isWheelEnabled={false}
                      />
                      <NumberInput
                        label={mode === 'discount'
                          ? t('admin.settings.payment.rechargeBonus.percentLabelDiscount')
                          : t('admin.settings.payment.rechargeBonus.percentLabel')}
                        isLabelHidden={index > 0}
                        value={tier.bonus_percent}
                        onChange={(value) => updatePercent(index, value)}
                        step={0.01}
                        units={mode === 'discount' ? '% OFF' : '%'}
                        placeholder="20"
                        status={issue?.field === 'bonus_percent' ? { type: 'error' } : undefined}
                        isWheelEnabled={false}
                      />
                    </Grid>
                  </StackItem>
                  <IconButton
                    variant="ghost"
                    label={t('admin.settings.payment.rechargeBonus.removeTier')}
                    tooltip={t('admin.settings.payment.rechargeBonus.removeTier')}
                    icon={<Icon icon={XMarkIcon} />}
                    onClick={() => removeTier(index)}
                  />
                </HStack>
                {issue ? (
                  <Text type="supporting" color="primary">
                    {issue.message}
                  </Text>
                ) : (
                  rowIncomplete(index) && (
                    <Text type="supporting" color="secondary">
                      {t('admin.settings.payment.rechargeBonus.incompleteRow')}
                    </Text>
                  )
                )}
              </VStack>
            )
          })}
        </VStack>
      )}

      <HStack>
        <Button
          size="sm"
          icon={<Icon icon={PlusIcon} />}
          label={t('admin.settings.payment.rechargeBonus.addTier')}
          onClick={addTier}
          isDisabled={tiers.length >= MAX_RECHARGE_BONUS_TIERS}
        />
      </HStack>

      {sanitizedTiers.length > 0 && (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="supporting" color="secondary">
            {t('admin.settings.payment.rechargeBonus.previewTitle')}
          </Text>
          {sanitizedTiers.map((interval, index) => (
            <Token key={index} size="sm" label={intervalLabel(interval)} />
          ))}
        </HStack>
      )}

      <TextArea
        label={t('admin.settings.payment.rechargeBonus.noticeLabel')}
        description={t('admin.settings.payment.rechargeBonus.noticeHint')}
        value={notice || ''}
        onChange={(value) => onNoticeChange(value)}
        placeholder={t('admin.settings.payment.rechargeBonus.noticePlaceholder')}
        rows={3}
      />
    </VStack>
  )
}

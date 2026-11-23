import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import type { ProviderInstance } from '@/types/payment'
import type { TypeOption } from '@/components/payment/providerConfig'
import { extractApiErrorMessage, extractI18nErrorMessage } from '@/utils/apiError'
import { formatBalanceRechargeMultiplier } from '@/utils/rechargeBonus'
import { RechargeBonusTierEditor, type RechargeBonusTierDraft, type RechargeBonusMode } from '~/components/admin/settings/RechargeBonusTierEditor'
import { PaymentProviderList } from '~/components/payment/PaymentProviderList'
import { PaymentProviderDialog, type ProviderSavePayload } from '~/components/payment/PaymentProviderDialog'
import { PROVIDER_KEY_LABELS, type ProviderToggleField } from '~/components/payment/ProviderCard'
import {
  findProviderEnablementConflict,
  type ProviderEnablementCandidate,
  type ProviderEnablementConflict,
} from '~/components/payment/providerEnablement'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'

type SystemSettings = any

interface PaymentSettingsTabProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

type LoadBalanceStrategy = 'round-robin' | 'least-amount'
type RateLimitUnit = 'minute' | 'hour' | 'day'
type RateLimitWindowMode = 'rolling' | 'fixed'

interface PaymentFormState {
  // Basic settings
  payment_enabled: boolean
  payment_product_name_prefix: string
  payment_product_name_suffix: string

  // Amount limits
  payment_min_amount: number
  payment_max_amount: number
  payment_daily_limit: number
  payment_max_pending_orders: number
  payment_order_timeout_minutes: number

  // Balance and rates
  payment_balance_recharge_multiplier: number
  payment_subscription_usd_to_cny_rate: number
  payment_recharge_fee_rate: number

  // Load balancing
  payment_load_balance_strategy: LoadBalanceStrategy

  // Cancel rate limiting
  payment_cancel_rate_limit_enabled: boolean
  payment_cancel_rate_limit_max: number
  payment_cancel_rate_limit_window: number
  payment_cancel_rate_limit_unit: RateLimitUnit
  payment_cancel_rate_limit_window_mode: RateLimitWindowMode

  // Payment type specific
  payment_alipay_force_qrcode: boolean
  payment_alipay_mobile_precreate_deep_link: boolean

  // Enabled payment types
  payment_enabled_types: string[]

  // Help content
  payment_help_image_url: string
  payment_help_text: string

  // Recharge bonus
  payment_recharge_bonus_tiers: RechargeBonusTierDraft[]
  payment_recharge_bonus_mode: RechargeBonusMode
  payment_recharge_bonus_notice: string
}

type NumberField = {
  [K in keyof PaymentFormState]: PaymentFormState[K] extends number ? K : never
}[keyof PaymentFormState]

const SECTION_COLUMNS = { minWidth: 320, max: 2 }
const PAIR_COLUMNS = { minWidth: 180, max: 2 }

// The backend routes any unknown strategy round-robin and counts any unknown window unit
// in hours (an empty one in days), so a stored legacy value is shown as what it really does.
function toLoadBalanceStrategy(value: unknown): LoadBalanceStrategy {
  return value === 'least-amount' ? 'least-amount' : 'round-robin'
}

function toRateLimitUnit(value: unknown): RateLimitUnit {
  if (value === 'minute' || value === 'day') return value
  return value ? 'hour' : 'day'
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Grid columns={SECTION_COLUMNS} gap={10}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        {description && (
          <Text type="supporting" color="secondary">
            {description}
          </Text>
        )}
      </VStack>
      <VStack gap={4} hAlign="stretch">
        {children}
      </VStack>
    </Grid>
  )
}

export function PaymentSettingsTab({ settings, onSave, saving }: PaymentSettingsTabProps) {
  const { t } = useI18n()

  const [form, setForm] = useState<PaymentFormState>({
    payment_enabled: settings.payment_enabled ?? false,
    payment_product_name_prefix: settings.payment_product_name_prefix || '',
    payment_product_name_suffix: settings.payment_product_name_suffix || '',
    payment_min_amount: settings.payment_min_amount ?? 1,
    payment_max_amount: settings.payment_max_amount ?? 10000,
    payment_daily_limit: settings.payment_daily_limit ?? 50000,
    payment_max_pending_orders: settings.payment_max_pending_orders ?? 3,
    payment_order_timeout_minutes: settings.payment_order_timeout_minutes ?? 30,
    payment_balance_recharge_multiplier: settings.payment_balance_recharge_multiplier ?? 1,
    payment_subscription_usd_to_cny_rate: settings.payment_subscription_usd_to_cny_rate ?? 0,
    payment_recharge_fee_rate: settings.payment_recharge_fee_rate ?? 0,
    payment_load_balance_strategy: toLoadBalanceStrategy(settings.payment_load_balance_strategy),
    payment_cancel_rate_limit_enabled: settings.payment_cancel_rate_limit_enabled ?? false,
    payment_cancel_rate_limit_max: settings.payment_cancel_rate_limit_max ?? 10,
    payment_cancel_rate_limit_window: settings.payment_cancel_rate_limit_window ?? 1,
    payment_cancel_rate_limit_unit: toRateLimitUnit(settings.payment_cancel_rate_limit_unit),
    payment_cancel_rate_limit_window_mode: settings.payment_cancel_rate_limit_window_mode || 'rolling',
    payment_alipay_force_qrcode: settings.payment_alipay_force_qrcode ?? false,
    payment_alipay_mobile_precreate_deep_link: settings.payment_alipay_mobile_precreate_deep_link ?? false,
    payment_enabled_types: settings.payment_enabled_types || [],
    payment_help_image_url: settings.payment_help_image_url || '',
    payment_help_text: settings.payment_help_text || '',
    payment_recharge_bonus_tiers: settings.payment_recharge_bonus_tiers || [],
    payment_recharge_bonus_mode: (settings.payment_recharge_bonus_mode as RechargeBonusMode) || 'bonus',
    payment_recharge_bonus_notice: settings.payment_recharge_bonus_notice || '',
  })

  const [providers, setProviders] = useState<ProviderInstance[]>([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providerSaving, setProviderSaving] = useState(false)
  const [showProviderDialog, setShowProviderDialog] = useState(false)
  const [editingProvider, setEditingProvider] = useState<ProviderInstance | null>(null)
  const [deletingProvider, setDeletingProvider] = useState<ProviderInstance | null>(null)
  const [deletingProviderBusy, setDeletingProviderBusy] = useState(false)

  const paymentTypes = useMemo(() => [
    { value: 'easypay', label: 'EasyPay (Sub2APIPay)' },
    { value: 'alipay', label: 'Alipay (支付宝)' },
    { value: 'wxpay', label: 'WeChat Pay (微信支付)' },
    { value: 'stripe', label: 'Stripe' },
    { value: 'airwallex', label: 'Airwallex' },
  ], [])

  const loadBalanceOptions = useMemo(() => [
    { value: 'round-robin', label: t('admin.settings.payment.strategyRoundRobin') },
    { value: 'least-amount', label: t('admin.settings.payment.strategyLeastAmount') },
  ], [t])

  const rateLimitUnitOptions = useMemo(() => [
    { value: 'minute', label: t('admin.settings.payment.cancelRateLimitUnitMinute') },
    { value: 'hour', label: t('admin.settings.payment.cancelRateLimitUnitHour') },
    { value: 'day', label: t('admin.settings.payment.cancelRateLimitUnitDay') },
  ], [t])

  const rateLimitWindowOptions = useMemo(() => [
    { value: 'rolling', label: t('admin.settings.payment.rateLimit.rolling') },
    { value: 'fixed', label: t('admin.settings.payment.rateLimit.fixed') },
  ], [t])

  const productNamePreview = useMemo(() => {
    const prefix = form.payment_product_name_prefix || 'Sub2API'
    const suffix = form.payment_product_name_suffix || 'CNY'
    return `${prefix} 100 ${suffix}`
  }, [form.payment_product_name_prefix, form.payment_product_name_suffix])

  const balanceRechargePreview = useMemo(() => {
    const multiplier = form.payment_balance_recharge_multiplier || 1
    return t('admin.settings.payment.balanceRechargePreview', { usd: formatBalanceRechargeMultiplier(multiplier) })
  }, [form.payment_balance_recharge_multiplier, t])

  const rechargeFeePreview = useMemo(() => {
    const feeRate = form.payment_recharge_fee_rate || 0
    if (feeRate <= 0) return null
    return t('admin.settings.payment.rechargeFeePreview', {
      fee: (100 * feeRate / 100).toFixed(2),
      total: (100 + 100 * feeRate / 100).toFixed(2)
    })
  }, [form.payment_recharge_fee_rate, t])

  // An empty, invalid or zero entry is stored as `fallback` (0 means "no limit" for the amount fields).
  const setNumber = (field: NumberField, fallback: number) => (value: number | null) =>
    setForm(prev => ({
      ...prev,
      [field]: (typeof value === 'number' && Number.isFinite(value) ? value : 0) || fallback,
    }))

  const togglePaymentType = useCallback((type: string) => {
    const enabled = form.payment_enabled_types.includes(type)
    setForm(prev => ({
      ...prev,
      payment_enabled_types: enabled
        ? prev.payment_enabled_types.filter(t => t !== type)
        : [...prev.payment_enabled_types, type]
    }))
    if (!enabled) return
    // Disabling a payment type also disables its enabled provider instances (same as the Vue page).
    const matching = providers.filter(p => p.provider_key === type && p.enabled)
    for (const p of matching) {
      adminAPI.payment.updateProvider(p.id, { enabled: false })
        .then(() => setProviders(prev => prev.map(x => (x.id === p.id ? { ...x, enabled: false } : x))))
        .catch((err: unknown) => console.warn('[payment] disable provider failed', p.id, err))
    }
  }, [form.payment_enabled_types, providers])

  const handleSave = useCallback(async () => {
    const success = await onSave(form)
    if (success) {
      toast.success(t('common.saveSuccess'))
    }
  }, [form, onSave, t])

  // ==================== Provider Management ====================

  // Only a backend ApplicationError `reason` maps to payment.errors.*. A bare
  // generic code (e.g. NOT_FOUND from an unrelated 404) would otherwise be
  // shown as the order-specific "order not found" message.
  const showPaymentError = useCallback((err: unknown) => {
    const hasReason = !!(err as { reason?: unknown } | null)?.reason
    toast.error(hasReason
      ? extractI18nErrorMessage(err, t, 'payment.errors', t('common.error'))
      : extractApiErrorMessage(err, t('common.error')))
  }, [t])

  const allPaymentTypes = useMemo<TypeOption[]>(() => [
    { value: 'easypay', label: t('payment.methods.easypay') },
    { value: 'alipay', label: t('payment.methods.alipay') },
    { value: 'wxpay', label: t('payment.methods.wxpay') },
    { value: 'stripe', label: t('payment.methods.stripe') },
    { value: 'airwallex', label: t('payment.methods.airwallex') },
  ], [t])

  const providerKeyOptions = useMemo<TypeOption[]>(
    () => ['easypay', 'alipay', 'wxpay', 'stripe', 'airwallex'].map(value => ({
      value,
      label: t(PROVIDER_KEY_LABELS[value]),
    })),
    [t],
  )

  const enabledProviderKeyOptions = useMemo(
    () => providerKeyOptions.filter(opt => form.payment_enabled_types.includes(opt.value)),
    [providerKeyOptions, form.payment_enabled_types],
  )

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true)
    try {
      const res = await adminAPI.payment.getProviders()
      // Backend returns null supported_types for an empty Go slice; normalize to [].
      setProviders((res.data || []).map(p => ({
        ...p,
        supported_types: Array.isArray(p.supported_types) ? p.supported_types : [],
      })))
    } catch (err: unknown) {
      showPaymentError(err)
    } finally {
      setProvidersLoading(false)
    }
  }, [showPaymentError])

  // The provider list (and the payment-type toggles that use it) only render
  // while payment is enabled, so only fetch it then.
  useEffect(() => {
    if (form.payment_enabled) loadProviders()
  }, [form.payment_enabled, loadProviders])

  const findConflict = useCallback(
    (candidate: ProviderEnablementCandidate) => findProviderEnablementConflict(candidate, providers),
    [providers],
  )

  const showConflict = useCallback((conflict: ProviderEnablementConflict) => {
    toast.error(t('admin.settings.payment.enableConflict', {
      method: t(`payment.methods.${conflict.method}`),
      provider: conflict.conflicting.name,
    }))
  }, [t])

  const openCreateProvider = useCallback(() => {
    setEditingProvider(null)
    setShowProviderDialog(true)
  }, [])

  const openEditProvider = useCallback((provider: ProviderInstance) => {
    setEditingProvider(provider)
    setShowProviderDialog(true)
  }, [])

  const handleSaveProvider = useCallback(async (payload: ProviderSavePayload) => {
    setProviderSaving(true)
    try {
      const conflict = findConflict({
        id: editingProvider?.id ?? 0,
        provider_key: payload.provider_key,
        supported_types: payload.supported_types,
        enabled: payload.enabled,
        name: payload.name,
      })
      if (conflict) {
        showConflict(conflict)
        return
      }
      if (editingProvider) {
        await adminAPI.payment.updateProvider(editingProvider.id, payload)
      } else {
        await adminAPI.payment.createProvider(payload)
      }
      setShowProviderDialog(false)
      await loadProviders()
      // Save settings too so provider changes take effect immediately (same as the Vue page).
      await onSave(form)
    } catch (err: unknown) {
      showPaymentError(err)
    } finally {
      setProviderSaving(false)
    }
  }, [editingProvider, findConflict, form, loadProviders, onSave, showConflict, showPaymentError])

  const handleToggleField = useCallback(async (provider: ProviderInstance, field: ProviderToggleField) => {
    const newValue = !provider[field]
    if (field === 'enabled' && newValue) {
      const conflict = findConflict({ ...provider, enabled: true })
      if (conflict) {
        showConflict(conflict)
        return
      }
    }
    const payload: Partial<ProviderInstance> = { [field]: newValue }
    // Turning off refunds also turns off user-initiated refunds.
    if (field === 'refund_enabled' && !newValue) payload.allow_user_refund = false
    try {
      await adminAPI.payment.updateProvider(provider.id, payload)
      await loadProviders()
    } catch (err: unknown) {
      showPaymentError(err)
    }
  }, [findConflict, loadProviders, showConflict, showPaymentError])

  const handleToggleType = useCallback(async (provider: ProviderInstance, type: string) => {
    const current = Array.isArray(provider.supported_types) ? provider.supported_types : []
    const updated = current.includes(type) ? current.filter(v => v !== type) : [...current, type]
    const conflict = findConflict({ ...provider, supported_types: updated })
    if (conflict) {
      showConflict(conflict)
      return
    }
    try {
      await adminAPI.payment.updateProvider(provider.id, { supported_types: updated })
      await loadProviders()
    } catch (err: unknown) {
      showPaymentError(err)
    }
  }, [findConflict, loadProviders, showConflict, showPaymentError])

  const handleReorderProviders = useCallback(async (updates: { id: number; sort_order: number }[]) => {
    try {
      await Promise.all(updates.map(u => adminAPI.payment.updateProvider(u.id, { sort_order: u.sort_order })))
    } catch (err: unknown) {
      showPaymentError(err)
    }
    await loadProviders()
  }, [loadProviders, showPaymentError])

  const handleDeleteProvider = useCallback(async () => {
    if (!deletingProvider) return
    setDeletingProviderBusy(true)
    try {
      await adminAPI.payment.deleteProvider(deletingProvider.id)
      toast.success(t('common.deleted'))
      setDeletingProvider(null)
      await loadProviders()
    } catch (err: unknown) {
      showPaymentError(err)
    } finally {
      setDeletingProviderBusy(false)
    }
  }, [deletingProvider, loadProviders, showPaymentError, t])

  const saveButton = (
    <HStack>
      <Button
        variant="primary"
        label={saving ? t('common.saving') : t('common.save')}
        isLoading={saving}
        onClick={() => void handleSave()}
      />
    </HStack>
  )

  return (
    <VStack gap={6} hAlign="stretch">
      <SettingsSection
        title={t('admin.settings.payment.title')}
        description={t('admin.settings.payment.description')}
      >
        <CheckboxInput
          label={t('admin.settings.payment.enabled')}
          description={t('admin.settings.payment.enabledHint')}
          value={form.payment_enabled}
          onChange={(payment_enabled) => setForm(prev => ({ ...prev, payment_enabled }))}
        />
        {!form.payment_enabled && saveButton}
      </SettingsSection>

      {form.payment_enabled && (
        <>
          <Divider />

          <SettingsSection title={t('admin.settings.payment.productName')}>
            <Grid columns={PAIR_COLUMNS} gap={4}>
              <TextInput
                label={t('admin.settings.payment.productNamePrefix')}
                value={form.payment_product_name_prefix}
                onChange={(value) => setForm(prev => ({ ...prev, payment_product_name_prefix: value }))}
                placeholder="Sub2API"
              />
              <TextInput
                label={t('admin.settings.payment.productNameSuffix')}
                value={form.payment_product_name_suffix}
                onChange={(value) => setForm(prev => ({ ...prev, payment_product_name_suffix: value }))}
                placeholder="CNY"
              />
            </Grid>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text type="supporting" color="secondary">
                {t('admin.settings.payment.preview')}
              </Text>
              <Text type="supporting" color="primary">
                {productNamePreview}
              </Text>
            </HStack>
          </SettingsSection>

          <Divider />

          <SettingsSection title={t('admin.settings.payment.amountLimits')}>
            <Grid columns={PAIR_COLUMNS} gap={4}>
              <NumberInput
                label={t('admin.settings.payment.minAmount')}
                value={form.payment_min_amount || null}
                onChange={setNumber('payment_min_amount', 0)}
                hasClear
                min={0}
                step={0.01}
                placeholder={t('admin.settings.payment.noLimit')}
                isWheelEnabled={false}
              />
              <NumberInput
                label={t('admin.settings.payment.maxAmount')}
                value={form.payment_max_amount || null}
                onChange={setNumber('payment_max_amount', 0)}
                hasClear
                min={0}
                step={0.01}
                placeholder={t('admin.settings.payment.noLimit')}
                isWheelEnabled={false}
              />
              <NumberInput
                label={t('admin.settings.payment.dailyLimit')}
                value={form.payment_daily_limit || null}
                onChange={setNumber('payment_daily_limit', 0)}
                hasClear
                min={0}
                step={0.01}
                placeholder={t('admin.settings.payment.noLimit')}
                isWheelEnabled={false}
              />
              <NumberInput
                label={t('admin.settings.payment.maxPendingOrders')}
                value={form.payment_max_pending_orders}
                onChange={setNumber('payment_max_pending_orders', 0)}
                min={1}
                isIntegerOnly
                isWheelEnabled={false}
              />
            </Grid>
            <NumberInput
              label={t('admin.settings.payment.orderTimeout')}
              description={t('admin.settings.payment.orderTimeoutHint')}
              value={form.payment_order_timeout_minutes}
              onChange={setNumber('payment_order_timeout_minutes', 0)}
              min={1}
              isIntegerOnly
              placeholder="30"
              isWheelEnabled={false}
            />
          </SettingsSection>

          <Divider />

          <SettingsSection title={t('admin.settings.payment.balanceAndRates')}>
            <VStack gap={1} hAlign="stretch">
              <NumberInput
                label={t('admin.settings.payment.balanceRechargeMultiplier')}
                description={t('admin.settings.payment.balanceRechargeMultiplierHint')}
                value={form.payment_balance_recharge_multiplier}
                onChange={setNumber('payment_balance_recharge_multiplier', 1)}
                min={0.000001}
                step={0.000001}
                placeholder="1"
                isWheelEnabled={false}
              />
              {form.payment_balance_recharge_multiplier !== 1 && (
                <Text type="supporting" color="secondary">
                  {balanceRechargePreview}
                </Text>
              )}
            </VStack>
            <NumberInput
              label={t('admin.settings.payment.subscriptionUsdToCnyRate')}
              description={t('admin.settings.payment.subscriptionUsdToCnyRateHint')}
              value={form.payment_subscription_usd_to_cny_rate || null}
              onChange={setNumber('payment_subscription_usd_to_cny_rate', 0)}
              hasClear
              min={0}
              step={0.01}
              placeholder={t('admin.settings.payment.subscriptionUsdToCnyRateDisabled')}
              isWheelEnabled={false}
            />
            <VStack gap={1} hAlign="stretch">
              <NumberInput
                label={t('admin.settings.payment.rechargeFeeRate')}
                description={t('admin.settings.payment.rechargeFeeRateHint')}
                value={form.payment_recharge_fee_rate}
                onChange={(value) => {
                  const val = Math.min(100, Math.max(0, value || 0))
                  setForm(prev => ({ ...prev, payment_recharge_fee_rate: val }))
                }}
                min={0}
                max={100}
                step={0.01}
                units="%"
                placeholder="0"
                isWheelEnabled={false}
              />
              {rechargeFeePreview && (
                <Text type="supporting" color="secondary">
                  {rechargeFeePreview}
                </Text>
              )}
            </VStack>
          </SettingsSection>

          <Divider />

          <SettingsSection
            title={t('admin.settings.payment.cancelRateLimit')}
            description={t('admin.settings.payment.cancelRateLimitHint')}
          >
            <CheckboxInput
              label={t('common.enabled')}
              value={form.payment_cancel_rate_limit_enabled}
              onChange={(checked) => setForm(prev => ({ ...prev, payment_cancel_rate_limit_enabled: checked }))}
            />
            {form.payment_cancel_rate_limit_enabled && (
              <Grid columns={PAIR_COLUMNS} gap={4}>
                <NumberInput
                  label={t('admin.settings.payment.cancelRateLimitWindow')}
                  value={form.payment_cancel_rate_limit_window}
                  onChange={setNumber('payment_cancel_rate_limit_window', 1)}
                  min={1}
                  isIntegerOnly
                  isWheelEnabled={false}
                />
                <Selector
                  label={t('admin.settings.payment.cancelRateLimitUnit')}
                  options={rateLimitUnitOptions}
                  value={form.payment_cancel_rate_limit_unit}
                  onChange={(value) =>
                    setForm(prev => ({ ...prev, payment_cancel_rate_limit_unit: value as RateLimitUnit }))
                  }
                  width="100%"
                />
                <NumberInput
                  label={t('admin.settings.payment.cancelRateLimitMax')}
                  value={form.payment_cancel_rate_limit_max}
                  onChange={setNumber('payment_cancel_rate_limit_max', 1)}
                  min={1}
                  isIntegerOnly
                  units={t('admin.settings.payment.cancelRateLimitTimes')}
                  isWheelEnabled={false}
                />
                <Selector
                  label={t('admin.settings.payment.cancelRateLimitWindowMode')}
                  options={rateLimitWindowOptions}
                  value={form.payment_cancel_rate_limit_window_mode}
                  onChange={(value) =>
                    setForm(prev => ({ ...prev, payment_cancel_rate_limit_window_mode: value as RateLimitWindowMode }))
                  }
                  width="100%"
                />
              </Grid>
            )}
          </SettingsSection>

          <Divider />

          <SettingsSection title={t('admin.settings.payment.alipaySettings')}>
            <CheckboxInput
              label={t('admin.settings.payment.alipayForceQRCode')}
              description={t('admin.settings.payment.alipayForceQRCodeHint')}
              value={form.payment_alipay_force_qrcode}
              onChange={(checked) => setForm(prev => ({ ...prev, payment_alipay_force_qrcode: checked }))}
            />
            <CheckboxInput
              label={t('admin.settings.payment.alipayMobilePrecreateDeepLink')}
              description={t('admin.settings.payment.alipayMobilePrecreateDeepLinkHint')}
              value={form.payment_alipay_mobile_precreate_deep_link}
              onChange={(checked) =>
                setForm(prev => ({ ...prev, payment_alipay_mobile_precreate_deep_link: checked }))
              }
            />
          </SettingsSection>

          <Divider />

          <SettingsSection
            title={t('admin.settings.payment.enabledPaymentTypes')}
            description={t('admin.settings.payment.enabledPaymentTypesHint')}
          >
            <Grid columns={PAIR_COLUMNS} gap={3}>
              {paymentTypes.map(pt => (
                <CheckboxInput
                  key={pt.value}
                  label={pt.label}
                  value={form.payment_enabled_types.includes(pt.value)}
                  onChange={() => togglePaymentType(pt.value)}
                />
              ))}
            </Grid>
            <Selector
              label={t('admin.settings.payment.loadBalanceStrategy')}
              options={loadBalanceOptions}
              value={form.payment_load_balance_strategy}
              onChange={(value) =>
                setForm(prev => ({ ...prev, payment_load_balance_strategy: value as LoadBalanceStrategy }))
              }
              width="100%"
            />
          </SettingsSection>

          <Divider />

          <SettingsSection title={t('admin.settings.payment.helpContent')}>
            <TextInput
              label={t('admin.settings.payment.helpImage')}
              value={form.payment_help_image_url}
              onChange={(value) => setForm(prev => ({ ...prev, payment_help_image_url: value }))}
              placeholder={t('admin.settings.payment.helpImagePlaceholder')}
            />
            <TextArea
              label={t('admin.settings.payment.helpText')}
              value={form.payment_help_text}
              onChange={(value) => setForm(prev => ({ ...prev, payment_help_text: value }))}
              placeholder={t('admin.settings.payment.helpTextPlaceholder')}
              rows={3}
            />
          </SettingsSection>

          <Divider />

          <SettingsSection
            title={t('admin.settings.payment.rechargeBonus.label')}
            description={t('admin.settings.payment.rechargeBonus.hint')}
          >
            <RechargeBonusTierEditor
              tiers={form.payment_recharge_bonus_tiers}
              mode={form.payment_recharge_bonus_mode}
              notice={form.payment_recharge_bonus_notice}
              onTiersChange={(tiers) => setForm(prev => ({ ...prev, payment_recharge_bonus_tiers: tiers }))}
              onModeChange={(mode) => setForm(prev => ({ ...prev, payment_recharge_bonus_mode: mode }))}
              onNoticeChange={(notice) => setForm(prev => ({ ...prev, payment_recharge_bonus_notice: notice }))}
            />
          </SettingsSection>

          <Divider />

          <Grid columns={SECTION_COLUMNS} gap={10}>
            <VStack gap={1} />
            {saveButton}
          </Grid>

          <Divider />

          <PaymentProviderList
            providers={providers}
            loading={providersLoading}
            canCreate={form.payment_enabled_types.length > 0}
            enabledPaymentTypes={form.payment_enabled_types}
            allPaymentTypes={allPaymentTypes}
            redirectLabel={t('admin.settings.payment.easypayRedirect')}
            onRefresh={loadProviders}
            onCreate={openCreateProvider}
            onEdit={openEditProvider}
            onDelete={provider => setDeletingProvider(provider)}
            onToggleField={handleToggleField}
            onToggleType={handleToggleType}
            onReorder={handleReorderProviders}
          />
        </>
      )}

      <PaymentProviderDialog
        isOpen={showProviderDialog}
        saving={providerSaving}
        editing={editingProvider}
        defaultKey={enabledProviderKeyOptions[0]?.value || 'easypay'}
        allKeyOptions={providerKeyOptions}
        enabledKeyOptions={enabledProviderKeyOptions}
        allPaymentTypes={allPaymentTypes}
        redirectLabel={t('admin.settings.payment.easypayRedirect')}
        onClose={() => setShowProviderDialog(false)}
        onSave={handleSaveProvider}
      />

      <AlertDialog
        isOpen={deletingProvider !== null}
        onOpenChange={open => { if (!open) setDeletingProvider(null) }}
        title={t('admin.settings.payment.deleteProvider')}
        description={t('admin.settings.payment.deleteProviderConfirm')}
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={deletingProviderBusy}
        onAction={handleDeleteProvider}
      />
    </VStack>
  )
}

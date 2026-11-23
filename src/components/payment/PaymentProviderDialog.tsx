import { getGatewayBaseURL } from '@/api/url'
import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Switch } from '@astryxdesign/core/Switch'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { InputGroup, InputGroupText } from '@astryxdesign/core/InputGroup'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Banner } from '@astryxdesign/core/Banner'
import { Divider } from '@astryxdesign/core/Divider'
import { Code } from '@astryxdesign/core/Code'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import type { ProviderInstance } from '@/types/payment'
import type { EasyPayCustomMethod, TypeOption } from '@/components/payment/providerConfig'
import {
  PROVIDER_CONFIG_FIELDS,
  PROVIDER_SUPPORTED_TYPES,
  PROVIDER_CALLBACK_PATHS,
  WEBHOOK_PATHS,
  PAYMENT_MODE_QRCODE,
  PAYMENT_MODE_POPUP,
  PAYMENT_MODE_REDIRECT,
  STRIPE_SDK_API_VERSION,
  getAvailableTypes,
  extractBaseUrl,
  parseEasyPayCustomMethods,
  serializeEasyPayCustomMethods,
} from '@/components/payment/providerConfig'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { usePaymentMethodLabel } from './usePaymentMethodLabel'

export interface ProviderSavePayload {
  provider_key: string
  name: string
  supported_types: string[]
  enabled: boolean
  payment_mode: string
  refund_enabled: boolean
  allow_user_refund: boolean
  config: Record<string, string>
  limits: string
}

interface PaymentProviderDialogProps {
  isOpen: boolean
  saving: boolean
  editing: ProviderInstance | null
  /** Provider key preselected when creating a new provider. */
  defaultKey: string
  allKeyOptions: TypeOption[]
  enabledKeyOptions: TypeOption[]
  allPaymentTypes: TypeOption[]
  redirectLabel: string
  onClose: () => void
  onSave: (payload: ProviderSavePayload) => void
}

type LimitField = 'singleMin' | 'singleMax' | 'dailyLimit'
type Limits = Record<string, Partial<Record<LimitField, number>>>

interface FormState {
  name: string
  provider_key: string
  supported_types: string[]
  enabled: boolean
  payment_mode: string
  refund_enabled: boolean
  allow_user_refund: boolean
}

/** Default payment_mode per provider key; "" means the provider's built-in default. */
function defaultPaymentMode(providerKey: string): string {
  return providerKey === 'easypay' ? PAYMENT_MODE_QRCODE : ''
}

/** Provider keys whose admin UI exposes a payment_mode selector. */
function providerSupportsPaymentMode(providerKey: string): boolean {
  return providerKey === 'easypay' || providerKey === 'alipay'
}

/** Coerces stale payment_mode values from the DB back to the provider default. */
function isValidPaymentMode(providerKey: string, mode: string): boolean {
  if (providerKey === 'easypay') return mode === PAYMENT_MODE_QRCODE || mode === PAYMENT_MODE_POPUP
  if (providerKey === 'alipay') return mode === '' || mode === PAYMENT_MODE_REDIRECT
  return mode === ''
}

function defaultConfig(providerKey: string, base: Record<string, string> = {}): Record<string, string> {
  const next = { ...base }
  for (const f of PROVIDER_CONFIG_FIELDS[providerKey] || []) {
    if (f.defaultValue && !next[f.key]) next[f.key] = f.defaultValue
  }
  return next
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeCustomMethods(methods: EasyPayCustomMethod[]): EasyPayCustomMethod[] {
  return methods
    .map(m => ({
      type: normalizeCode(m.type),
      upstreamType: normalizeCode(m.upstreamType),
      displayName: m.displayName.trim(),
    }))
    .filter(m => m.type || m.upstreamType || m.displayName)
}

const defaultBaseUrl = getGatewayBaseURL()

const WEBHOOK_HINTS: Record<string, string> = {
  stripe: 'admin.settings.payment.stripeWebhookHint',
  airwallex: 'admin.settings.payment.airwallexWebhookHint',
}

export function PaymentProviderDialog({
  isOpen,
  saving,
  editing,
  defaultKey,
  allKeyOptions,
  enabledKeyOptions,
  allPaymentTypes,
  redirectLabel,
  onClose,
  onSave,
}: PaymentProviderDialogProps) {
  const { t } = useI18n()
  const resolveLabel = usePaymentMethodLabel()

  const [form, setForm] = useState<FormState>({
    name: '',
    provider_key: defaultKey,
    supported_types: [],
    enabled: true,
    payment_mode: defaultPaymentMode(defaultKey),
    refund_enabled: false,
    allow_user_refund: false,
  })
  const [config, setConfig] = useState<Record<string, string>>({})
  const [limits, setLimits] = useState<Limits>({})
  const [notifyBaseUrl, setNotifyBaseUrl] = useState('')
  const [returnBaseUrl, setReturnBaseUrl] = useState('')
  const [limitsExpanded, setLimitsExpanded] = useState(false)
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})
  const [customMethods, setCustomMethods] = useState<EasyPayCustomMethod[]>([])

  const resetSecondaryState = () => {
    setLimits({})
    setVisibleFields({})
    setNotifyBaseUrl('')
    setReturnBaseUrl('')
    setLimitsExpanded(false)
    setCustomMethods([])
  }

  // Mirrors the Vue dialog's reset()/loadProvider() each time it opens.
  useEffect(() => {
    if (!isOpen) return
    resetSecondaryState()
    if (!editing) {
      setForm({
        name: '',
        provider_key: defaultKey,
        supported_types: [...(PROVIDER_SUPPORTED_TYPES[defaultKey] || [])],
        enabled: true,
        payment_mode: defaultPaymentMode(defaultKey),
        refund_enabled: false,
        allow_user_refund: false,
      })
      setConfig(defaultConfig(defaultKey))
      return
    }

    const key = editing.provider_key
    setForm({
      name: editing.name,
      provider_key: key,
      supported_types: Array.isArray(editing.supported_types) ? [...editing.supported_types] : [],
      enabled: editing.enabled,
      payment_mode: isValidPaymentMode(key, editing.payment_mode || '')
        ? editing.payment_mode || ''
        : defaultPaymentMode(key),
      refund_enabled: editing.refund_enabled,
      allow_user_refund: editing.allow_user_refund,
    })

    // Backend omits sensitive fields, so they stay blank; blank on save keeps the stored secret.
    const nextConfig: Record<string, string> = {}
    if (editing.config) {
      for (const [k, v] of Object.entries(editing.config)) {
        if (k === 'notifyUrl' || k === 'returnUrl') continue
        if (k === 'customMethods' && key === 'easypay') {
          setCustomMethods(parseEasyPayCustomMethods(v))
          continue
        }
        nextConfig[k] = v
      }
      const paths = PROVIDER_CALLBACK_PATHS[key]
      if (paths?.notifyUrl && editing.config.notifyUrl) {
        setNotifyBaseUrl(extractBaseUrl(editing.config.notifyUrl, paths.notifyUrl))
      }
      if (paths?.returnUrl && editing.config.returnUrl) {
        setReturnBaseUrl(extractBaseUrl(editing.config.returnUrl, paths.returnUrl))
      }
    }
    setConfig(defaultConfig(key, nextConfig))

    if (editing.limits) {
      try {
        const parsed = JSON.parse(editing.limits) as Limits
        setLimits(parsed)
        setLimitsExpanded(Object.keys(parsed).length > 0)
      } catch {
        /* ignore malformed limits */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editing, defaultKey])

  const onKeyChange = (key: string) => {
    setForm(prev => ({
      ...prev,
      provider_key: key,
      supported_types: [...(PROVIDER_SUPPORTED_TYPES[key] || [])],
      payment_mode: defaultPaymentMode(key),
    }))
    resetSecondaryState()
    setConfig(defaultConfig(key))
  }

  const supportsPaymentMode = providerSupportsPaymentMode(form.provider_key)
  const callbackPaths = PROVIDER_CALLBACK_PATHS[form.provider_key] || null
  const webhookPath = WEBHOOK_PATHS[form.provider_key]
  const webhookHint = WEBHOOK_HINTS[form.provider_key]
  const providerWebhookUrl = webhookHint && webhookPath ? defaultBaseUrl + webhookPath : ''

  const paymentModeOptions = form.provider_key === 'alipay'
    ? [
        { value: '', label: t('admin.settings.payment.modeQRCode') },
        { value: PAYMENT_MODE_REDIRECT, label: t('admin.settings.payment.modeRedirect') },
      ]
    : [
        { value: PAYMENT_MODE_QRCODE, label: t('admin.settings.payment.modeQRCode') },
        { value: PAYMENT_MODE_POPUP, label: t('admin.settings.payment.modePopup') },
      ]

  const availableTypes = useMemo(() => {
    const base = getAvailableTypes(form.provider_key, allPaymentTypes, redirectLabel)
    if (form.provider_key === 'easypay') {
      for (const method of normalizeCustomMethods(customMethods)) {
        if (method.type && !base.some(opt => opt.value === method.type)) {
          base.push({ value: method.type, label: method.displayName || method.type })
        }
      }
    }
    return base.map(resolveLabel)
  }, [form.provider_key, allPaymentTypes, redirectLabel, customMethods, resolveLabel])

  const resolvedFields = (PROVIDER_CONFIG_FIELDS[form.provider_key] || []).map(f => ({
    ...f,
    label: f.label || t(`admin.settings.payment.field_${f.key}`),
  }))

  const paymentGuide = useMemo(() => {
    const item = (prefix: string) => ({
      title: t(`admin.settings.payment.${prefix}Title`),
      open: t(`admin.settings.payment.${prefix}Open`),
      call: t(`admin.settings.payment.${prefix}Call`),
      fallback: t(`admin.settings.payment.${prefix}Fallback`),
    })
    if (form.provider_key === 'alipay') {
      return {
        summary: t('admin.settings.payment.alipayGuideSummary'),
        note: '',
        items: [item('alipayGuideFaceToFace'), item('alipayGuidePagePay'), item('alipayGuideWap')],
      }
    }
    if (form.provider_key === 'wxpay') {
      return {
        summary: t('admin.settings.payment.wxpayGuideSummary'),
        note: t('admin.settings.payment.wxpayGuideNote'),
        items: [item('wxpayGuideNative'), item('wxpayGuideJsapi'), item('wxpayGuideH5')],
      }
    }
    if (form.provider_key === 'airwallex') {
      return {
        summary: t('admin.settings.payment.airwallexGuideSummary'),
        note: t('admin.settings.payment.airwallexGuideNote'),
        items: [],
      }
    }
    return null
  }, [form.provider_key, t])

  const limitableTypes: TypeOption[] = form.provider_key === 'stripe'
    ? [{ value: 'stripe', label: 'Stripe' }]
    : form.supported_types
        .filter(v => v !== 'easypay')
        .map(v => allPaymentTypes.find(pt => pt.value === v) || { value: v, label: v })

  const toggleType = (type: string) => {
    setForm(prev => ({
      ...prev,
      supported_types: prev.supported_types.includes(type)
        ? prev.supported_types.filter(v => v !== type)
        : [...prev.supported_types, type],
    }))
  }

  const updateCustomMethod = (index: number, patch: Partial<EasyPayCustomMethod>) => {
    setCustomMethods(prev => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  const getLimitVal = (paymentType: string, field: LimitField): number | null => {
    const val = limits[paymentType]?.[field]
    return val && val > 0 ? val : null
  }

  const limitPlaceholder = (paymentType: string): string => {
    const l = limits[paymentType]
    const hasAny = !!l && ((l.singleMin ?? 0) > 0 || (l.singleMax ?? 0) > 0 || (l.dailyLimit ?? 0) > 0)
    return hasAny ? t('admin.settings.payment.limitsNoLimit') : t('admin.settings.payment.limitsUseGlobal')
  }

  const setLimitVal = (paymentType: string, field: LimitField, val: number | null) => {
    // Cleared clears the field (falls back to global); values <= 0 are rejected.
    if (val !== null && !isNaN(val) && val <= 0) return
    setLimits(prev => {
      const entry = { ...(prev[paymentType] || {}) }
      if (val === null || isNaN(val)) delete entry[field]
      else entry[field] = val
      return { ...prev, [paymentType]: entry }
    })
  }

  const serializeLimits = (): string => {
    const result: Limits = {}
    for (const [pt, fields] of Object.entries(limits)) {
      const clean: Partial<Record<LimitField, number>> = {}
      for (const [k, v] of Object.entries(fields)) {
        if (v && v > 0) clean[k as LimitField] = v
      }
      if (Object.keys(clean).length > 0) result[pt] = clean
    }
    return Object.keys(result).length > 0 ? JSON.stringify(result) : ''
  }

  const validateCustomMethods = (methods: EasyPayCustomMethod[]): string | null => {
    const seen = new Set<string>()
    const reserved = PROVIDER_SUPPORTED_TYPES.easypay || []
    for (const m of methods) {
      if (!m.type || !m.upstreamType) return t('admin.settings.payment.validationEasyPayCustomMethodRequired')
      if (!/^[a-z0-9_-]+$/.test(m.type)) return t('admin.settings.payment.validationEasyPayCustomMethodTypeInvalid')
      if (!/^[a-z0-9_.-]+$/.test(m.upstreamType)) return t('admin.settings.payment.validationEasyPayCustomMethodUpstreamTypeInvalid')
      if (reserved.includes(m.type)) return t('admin.settings.payment.validationEasyPayCustomMethodReserved')
      if (m.type.startsWith('alipay') || m.type.startsWith('wxpay')) {
        return t('admin.settings.payment.validationEasyPayCustomMethodPrefixReserved')
      }
      if (seen.has(m.type)) return t('admin.settings.payment.validationEasyPayCustomMethodDuplicate')
      seen.add(m.type)
    }
    return null
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error(t('admin.settings.payment.validationNameRequired'))
      return
    }

    let supportedTypes = form.supported_types
    const normalizedMethods = normalizeCustomMethods(customMethods)
    if (form.provider_key === 'easypay') {
      const error = validateCustomMethods(normalizedMethods)
      if (error) {
        toast.error(error)
        return
      }
      // Keep only built-in EasyPay types plus the configured custom methods, which are always on.
      const baseTypes = new Set(PROVIDER_SUPPORTED_TYPES.easypay || [])
      const customTypes = normalizedMethods.map(m => m.type)
      supportedTypes = supportedTypes
        .map(normalizeCode)
        .filter(type => baseTypes.has(type) || customTypes.includes(type))
      for (const type of customTypes) {
        if (!supportedTypes.includes(type)) supportedTypes.push(type)
      }
    }

    // Edit mode may leave sensitive fields blank to keep the stored value.
    const fields = PROVIDER_CONFIG_FIELDS[form.provider_key] || []
    for (const f of fields) {
      if (f.optional) continue
      if (editing && f.sensitive) continue
      if (!(config[f.key] || '').trim()) {
        const label = f.label || t(`admin.settings.payment.field_${f.key}`)
        toast.error(t('admin.settings.payment.validationFieldRequired', { field: label }))
        return
      }
    }

    const clearable = new Set(fields.filter(f => f.clearable).map(f => f.key))
    const filteredConfig: Record<string, string> = {}
    for (const [k, v] of Object.entries(config)) {
      if (!v || !v.trim()) {
        if (clearable.has(k)) filteredConfig[k] = ''
        continue
      }
      filteredConfig[k] = v
    }
    if (form.provider_key === 'easypay') {
      filteredConfig.customMethods = serializeEasyPayCustomMethods(normalizedMethods)
    }

    // Each callback URL is an editable base plus a fixed path; an empty base uses the current origin.
    if (callbackPaths) {
      const notifyBase = (notifyBaseUrl.trim() || defaultBaseUrl).replace(/\/+$/, '')
      const returnBase = (returnBaseUrl.trim() || defaultBaseUrl).replace(/\/+$/, '')
      setNotifyBaseUrl(notifyBase)
      setReturnBaseUrl(returnBase)
      if (callbackPaths.notifyUrl) filteredConfig.notifyUrl = notifyBase + callbackPaths.notifyUrl
      if (callbackPaths.returnUrl) filteredConfig.returnUrl = returnBase + callbackPaths.returnUrl
    }

    setForm(prev => ({ ...prev, supported_types: supportedTypes }))
    onSave({
      provider_key: form.provider_key,
      name: form.name,
      supported_types: supportedTypes,
      enabled: form.enabled,
      payment_mode: supportsPaymentMode ? form.payment_mode : '',
      refund_enabled: form.refund_enabled,
      allow_user_refund: form.refund_enabled ? form.allow_user_refund : false,
      config: filteredConfig,
      limits: serializeLimits(),
    })
  }

  const keyOptions = (editing ? allKeyOptions : enabledKeyOptions).map(o => ({ value: o.value, label: o.label }))
  const close = (open: boolean) => {
    if (!open) onClose()
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={close} width={760} maxHeight="90dvh" purpose="form">
      <Layout
        header={
          <DialogHeader
            title={editing ? t('admin.settings.payment.editProvider') : t('admin.settings.payment.createProvider')}
            onOpenChange={close}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <Grid columns={2} gap={4}>
                <TextInput
                  label={t('admin.settings.payment.providerName')}
                  isRequired
                  value={form.name}
                  onChange={name => setForm(prev => ({ ...prev, name }))}
                />
                <Selector
                  label={t('admin.settings.payment.providerKey')}
                  isRequired
                  options={keyOptions}
                  value={form.provider_key}
                  isDisabled={!!editing}
                  onChange={onKeyChange}
                />
              </Grid>

              <HStack gap={5} vAlign="center" wrap="wrap">
                <Switch
                  label={t('common.enabled')}
                  value={form.enabled}
                  onChange={enabled => setForm(prev => ({ ...prev, enabled }))}
                />
                <Switch
                  label={t('admin.settings.payment.refundEnabled')}
                  value={form.refund_enabled}
                  onChange={refund =>
                    setForm(prev => ({
                      ...prev,
                      refund_enabled: refund,
                      allow_user_refund: refund ? prev.allow_user_refund : false,
                    }))
                  }
                />
                {form.refund_enabled && (
                  <Switch
                    label={t('admin.settings.payment.allowUserRefund')}
                    value={form.allow_user_refund}
                    onChange={allow => setForm(prev => ({ ...prev, allow_user_refund: allow }))}
                  />
                )}
                {supportsPaymentMode && (
                  <HStack gap={2} vAlign="center">
                    <Text type="supporting" weight="medium">{t('admin.settings.payment.paymentMode')}</Text>
                    <SegmentedControl
                      size="sm"
                      label={t('admin.settings.payment.paymentMode')}
                      value={form.payment_mode}
                      onChange={mode => setForm(prev => ({ ...prev, payment_mode: mode }))}
                    >
                      {paymentModeOptions.map(mode => (
                        <SegmentedControlItem key={mode.value || 'default'} value={mode.value} label={mode.label} />
                      ))}
                    </SegmentedControl>
                  </HStack>
                )}
                {availableTypes.length > 1 && (
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text type="supporting" weight="medium">{t('admin.settings.payment.supportedTypes')}</Text>
                    {availableTypes.map(pt => (
                      <ToggleButton
                        key={pt.value}
                        size="sm"
                        label={pt.label}
                        isPressed={form.supported_types.includes(pt.value)}
                        onPressedChange={() => toggleType(pt.value)}
                      />
                    ))}
                  </HStack>
                )}
              </HStack>

              {form.provider_key === 'easypay' && (
                <Card variant="muted" padding={3}>
                  <VStack gap={3} hAlign="stretch">
                    <HStack gap={3} vAlign="center">
                      <StackItem size="fill">
                        <VStack gap={1}>
                          <Text weight="medium">{t('admin.settings.payment.easypayCustomMethods')}</Text>
                          <Text type="supporting">{t('admin.settings.payment.easypayCustomMethodsHint')}</Text>
                        </VStack>
                      </StackItem>
                      <Button
                        size="sm"
                        label={t('admin.settings.payment.addCustomMethod')}
                        onClick={() => setCustomMethods(prev => [...prev, { type: '', upstreamType: '', displayName: '' }])}
                      />
                    </HStack>
                    {customMethods.map((method, index) => (
                      <HStack key={index} gap={2} vAlign="end">
                        <StackItem size="fill">
                          <TextInput
                            size="sm"
                            label={t('admin.settings.payment.customMethodType')}
                            value={method.type}
                            placeholder="credit_card"
                            onChange={type => updateCustomMethod(index, { type })}
                          />
                        </StackItem>
                        <StackItem size="fill">
                          <TextInput
                            size="sm"
                            label={t('admin.settings.payment.customMethodUpstreamType')}
                            value={method.upstreamType}
                            placeholder="credit_card"
                            onChange={upstreamType => updateCustomMethod(index, { upstreamType })}
                          />
                        </StackItem>
                        <StackItem size="fill">
                          <TextInput
                            size="sm"
                            label={t('admin.settings.payment.customMethodDisplayName')}
                            value={method.displayName}
                            placeholder={t('admin.settings.payment.customMethodDisplayNamePlaceholder')}
                            onChange={displayName => updateCustomMethod(index, { displayName })}
                          />
                        </StackItem>
                        <Button
                          size="sm"
                          variant="destructive"
                          label={t('common.delete')}
                          onClick={() => setCustomMethods(prev => prev.filter((_, i) => i !== index))}
                        />
                      </HStack>
                    ))}
                  </VStack>
                </Card>
              )}

              <Divider />

              <VStack gap={3} hAlign="stretch">
                <Text weight="semibold">{t('admin.settings.payment.providerConfig')}</Text>
                {paymentGuide && (
                  <Banner
                    status="info"
                    title={paymentGuide.summary}
                    description={paymentGuide.note || undefined}
                    collapsible={paymentGuide.items.length > 0 ? { defaultIsOpen: false } : false}
                  >
                    {paymentGuide.items.length > 0 && (
                      <VStack gap={3}>
                        {paymentGuide.items.map(item => (
                          <VStack key={item.title} gap={1}>
                            <Text weight="medium">{item.title}</Text>
                            <Text type="supporting">{t('admin.settings.payment.guideOpenLabel')}{item.open}</Text>
                            <Text type="supporting">{t('admin.settings.payment.guideCallLabel')}{item.call}</Text>
                            <Text type="supporting">{t('admin.settings.payment.guideFallbackLabel')}{item.fallback}</Text>
                          </VStack>
                        ))}
                      </VStack>
                    )}
                  </Banner>
                )}

                {resolvedFields.map(field => {
                  const value = config[field.key] || ''
                  const setValue = (v: string) => setConfig(prev => ({ ...prev, [field.key]: v }))
                  const hint = field.hintKey ? t(field.hintKey) : undefined
                  const requiredProps = field.optional ? { isOptional: true } : { isRequired: true }
                  if (field.sensitive && field.key.toLowerCase().includes('key') && field.key !== 'pkey') {
                    return (
                      <TextArea
                        key={field.key}
                        label={field.label}
                        {...requiredProps}
                        description={hint}
                        rows={3}
                        value={value}
                        placeholder={editing ? t('admin.accounts.leaveEmptyToKeep') : ''}
                        onChange={setValue}
                      />
                    )
                  }
                  if (field.sensitive) {
                    const visible = !!visibleFields[field.key]
                    return (
                      <HStack key={field.key} gap={2} vAlign="end">
                        <StackItem size="fill">
                          <TextInput
                            type={visible ? 'text' : 'password'}
                            label={field.label}
                            {...requiredProps}
                            description={hint}
                            value={value}
                            placeholder={editing ? t('admin.accounts.leaveEmptyToKeep') : field.defaultValue || ''}
                            onChange={setValue}
                          />
                        </StackItem>
                        <IconButton
                          variant="ghost"
                          label={field.label}
                          icon={<Icon icon={visible ? EyeSlashIcon : EyeIcon} />}
                          onClick={() => setVisibleFields(prev => ({ ...prev, [field.key]: !visible }))}
                        />
                      </HStack>
                    )
                  }
                  if (field.options?.length) {
                    return (
                      <Selector
                        key={field.key}
                        label={field.label}
                        {...requiredProps}
                        description={hint}
                        options={field.options.map(o => ({ value: o.value, label: o.label }))}
                        hasSearch={field.options.length > 5}
                        value={value}
                        onChange={setValue}
                      />
                    )
                  }
                  return (
                    <TextInput
                      key={field.key}
                      label={field.label}
                      {...requiredProps}
                      description={hint}
                      value={value}
                      placeholder={field.defaultValue || ''}
                      onChange={setValue}
                    />
                  )
                })}

                {callbackPaths?.notifyUrl && (
                  <InputGroup label={t('admin.settings.payment.field_notifyUrl')} isRequired>
                    <TextInput
                      label={t('admin.settings.payment.field_notifyUrl')}
                      isLabelHidden
                      value={notifyBaseUrl}
                      placeholder={defaultBaseUrl}
                      onChange={setNotifyBaseUrl}
                    />
                    <InputGroupText>{callbackPaths.notifyUrl}</InputGroupText>
                  </InputGroup>
                )}
                {callbackPaths?.returnUrl && (
                  <InputGroup label={t('admin.settings.payment.field_returnUrl')} isRequired>
                    <TextInput
                      label={t('admin.settings.payment.field_returnUrl')}
                      isLabelHidden
                      value={returnBaseUrl}
                      placeholder={defaultBaseUrl}
                      onChange={setReturnBaseUrl}
                    />
                    <InputGroupText>{callbackPaths.returnUrl}</InputGroupText>
                  </InputGroup>
                )}

                {providerWebhookUrl && (
                  <Banner
                    status="info"
                    title={t(webhookHint)}
                    description={<Code>{providerWebhookUrl}</Code>}
                    collapsible={false}
                  >
                    {form.provider_key === 'stripe' && (
                      <Text type="supporting">
                        {t('admin.settings.payment.stripeWebhookApiVersionHint', { version: STRIPE_SDK_API_VERSION })}
                      </Text>
                    )}
                  </Banner>
                )}
              </VStack>

              {limitableTypes.length > 0 && (
                <>
                  <Divider />
                  <Collapsible
                    isOpen={limitsExpanded}
                    onOpenChange={setLimitsExpanded}
                    trigger={<Text weight="semibold">{t('admin.settings.payment.limitsTitle')}</Text>}
                  >
                    <VStack gap={3} hAlign="stretch">
                      {limitableTypes.map(lt => (
                        <Card key={lt.value} variant="muted" padding={3}>
                          <VStack gap={2} hAlign="stretch">
                            <Text type="supporting" weight="medium">{lt.label}</Text>
                            <Grid columns={3} gap={3}>
                              {(
                                [
                                  ['singleMin', 'admin.settings.payment.limitSingleMin'],
                                  ['singleMax', 'admin.settings.payment.limitSingleMax'],
                                  ['dailyLimit', 'admin.settings.payment.limitDaily'],
                                ] as const
                              ).map(([field, labelKey]) => (
                                <NumberInput
                                  key={field}
                                  size="sm"
                                  label={t(labelKey)}
                                  hasClear
                                  min={0.01}
                                  step={0.01}
                                  value={getLimitVal(lt.value, field)}
                                  placeholder={limitPlaceholder(lt.value)}
                                  onChange={v => setLimitVal(lt.value, field, v)}
                                />
                              ))}
                            </Grid>
                          </VStack>
                        </Card>
                      ))}
                      <Text type="supporting">{t('admin.settings.payment.limitsHint')}</Text>
                    </VStack>
                  </Collapsible>
                </>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button
                label={saving ? t('common.saving') : t('common.save')}
                variant="primary"
                isLoading={saving}
                onClick={handleSave}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

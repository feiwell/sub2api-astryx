import { Banner } from '@astryxdesign/core/Banner'
import { Grid } from '@astryxdesign/core/Grid'
import { Selector } from '@astryxdesign/core/Selector'
import { VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useI18n } from '~/i18n'
import type { ModerationMode } from '~/lib/api/admin/riskControl'
import { ENGINES, ENGINE_DEFAULTS, SETTING_RANGES } from './riskForm'
import { RiskKeySection } from './RiskKeyManager'
import { engineLabel } from './riskModel'
import { FIELD_COLUMNS, SettingNumber, SettingToggle, SettingsSection } from './RiskSettingsParts'
import type { RiskControl } from './useRiskControl'
import type { RiskSettings } from './useRiskSettings'

const MODES: readonly ModerationMode[] = ['pre_block', 'observe', 'off']
// Selector values are strings, so "no proxy" needs a value of its own.
const NO_PROXY = ''

/**
 * Whether and how requests are audited, and the engine that audits them. Everything under the
 * engine's name belongs to that engine alone: the other engine keeps its own address, keys and
 * thresholds, and choosing it here brings them into view.
 */
export function RiskSettingsBasicTab({ settings, control }: { settings: RiskSettings; control: RiskControl }) {
  const { t } = useI18n()
  const { draft, engine } = settings

  const modeText: Record<ModerationMode, { label: string; description: string }> = {
    pre_block: { label: t('admin.riskControl.modePreBlock'), description: t('admin.riskControl.modePreBlockDesc') },
    observe: { label: t('admin.riskControl.modeObserve'), description: t('admin.riskControl.modeObserveDesc') },
    off: { label: t('admin.riskControl.modeOff'), description: t('admin.riskControl.modeOffDesc') },
  }

  const isProxyListed = engine.proxy_id == null || control.proxies.some((proxy) => proxy.id === engine.proxy_id)
  const proxyOptions = [
    { value: NO_PROXY, label: t('admin.accounts.noProxy') },
    // A saved proxy the list does not have (deleted since, or the list did not load) stays selectable.
    ...(isProxyListed ? [] : [{ value: String(engine.proxy_id), label: `#${engine.proxy_id}` }]),
    ...control.proxies.map((proxy) => ({
      value: String(proxy.id),
      label: `${proxy.name} (${proxy.host}:${proxy.port})`,
    })),
  ]

  return (
    <VStack gap={4}>
      <Grid columns={FIELD_COLUMNS} gap={4}>
        <SettingToggle
          label={t('admin.riskControl.enabled')}
          hint={t('admin.riskControl.enabledHint')}
          value={draft.enabled}
          onChange={(enabled) => settings.edit({ enabled })}
        />
        <Selector
          label={t('admin.riskControl.mode')}
          description={modeText[draft.mode]?.description}
          width="100%"
          value={draft.mode}
          onChange={(mode) => settings.edit({ mode: mode as ModerationMode })}
          options={MODES.map((mode) => ({ value: mode, label: modeText[mode].label }))}
        />
        <Selector
          label={t('admin.riskControl.engine')}
          width="100%"
          value={draft.engine}
          onChange={settings.selectEngine}
          isDisabled={settings.testing != null || settings.isSaving}
          options={ENGINES.map((name) => ({ value: name, label: engineLabel(name) }))}
        />
        <SettingNumber
          settings={settings}
          field="sample_rate"
          label={t('admin.riskControl.sampleRate')}
          units="%"
          value={draft.sample_rate}
          {...SETTING_RANGES.sample_rate}
          onChange={(sample_rate) => settings.edit({ sample_rate })}
        />
      </Grid>

      <SettingsSection title={engineLabel(draft.engine)}>
        {draft.engine === 'typesafe' && <Banner status="warning" title={t('admin.riskControl.typeSafeNotice')} />}
        {/* Keyed by the engine: text a number field refused does not follow to the other engine. */}
        <Grid key={draft.engine} columns={FIELD_COLUMNS} gap={4}>
          <TextInput
            label={t('admin.riskControl.baseUrl')}
            type="url"
            width="100%"
            value={engine.base_url}
            onChange={(base_url) => settings.editEngine({ base_url: base_url.trim() })}
            placeholder={ENGINE_DEFAULTS[draft.engine].base_url}
          />
          <TextInput
            label={t('admin.riskControl.model')}
            width="100%"
            value={engine.model}
            onChange={(model) => settings.editEngine({ model: model.trim() })}
            placeholder={ENGINE_DEFAULTS[draft.engine].model}
          />
          <SettingNumber
            settings={settings}
            field="timeout_ms"
            label={t('admin.riskControl.timeoutMs')}
            value={engine.timeout_ms}
            {...SETTING_RANGES.timeout_ms}
            onChange={(timeout_ms) => settings.editEngine({ timeout_ms })}
          />
          <SettingNumber
            settings={settings}
            field="retry_count"
            label={t('admin.riskControl.retryCount')}
            value={engine.retry_count}
            {...SETTING_RANGES.retry_count}
            onChange={(retry_count) => settings.editEngine({ retry_count })}
          />
          <Selector
            label={t('admin.riskControl.proxy')}
            description={t('admin.riskControl.proxyHint')}
            width="100%"
            value={engine.proxy_id == null ? NO_PROXY : String(engine.proxy_id)}
            onChange={(id) => settings.editEngine({ proxy_id: id === NO_PROXY ? null : Number(id) })}
            options={proxyOptions}
            hasSearch
          />
        </Grid>
      </SettingsSection>

      <RiskKeySection settings={settings} />
    </VStack>
  )
}

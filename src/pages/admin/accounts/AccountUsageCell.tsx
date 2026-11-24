import { Button } from '@astryxdesign/core/Button'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { isMultiProtocolApiKeyPlatform } from '@/components/account/credentialsBuilder'
import { useI18n } from '~/i18n'
import { ClaudeCredits, OpenAICredits } from './QuotaCreditActions'
import { GrokUsage } from './GrokUsage'
import { AntigravityUsage, GeminiUsage, UsageWarning, WindowBar } from './PlatformUsageWindows'
import { CNProviderUsage, ManagedProviderUsage, type UpdateAccount } from './ProviderQuotaCells'
import { UsageProgressBar, UsageStats } from './UsageProgressBar'
import { accountShowsInlineTodayStats, accountSupportsActiveUsageQuery, accountSupportsBatchUsage, computeLocalQuotaBars } from './usageRules'
import { useAccountUsageRow, type UsageCellProps } from './useAccountUsageRow'

export function AccountUsageCell(props: UsageCellProps & { update: UpdateAccount; lastProbe: Map<number, number> }) {
  const { account, update } = props
  const { t } = useI18n()
  const remote = accountSupportsBatchUsage(account)
  const local = accountShowsInlineTodayStats(account)
  const { data, active, visible, ref } = useAccountUsageRow(props, remote, local)
  const managed = account.ollama_cloud_usage?.eligible || account.opencode_go_usage?.eligible
  const multi = isMultiProtocolApiKeyPlatform(account.platform)
  const { usage, today } = data
  const showGemini = account.platform === 'gemini' && (remote || account.type === 'service_account')
  const bars = computeLocalQuotaBars(account)
  const labels = { daily: '1d', weekly: '7d', total: t('common.total') }
  return <VStack ref={ref} gap={1} hAlign="stretch" aria-busy={data.usageLoading || data.todayLoading}>
    {((data.usageLoading && !usage) || (local && data.todayLoading && !today)) && <ProgressBar label={t('common.loading')} isLabelHidden isIndeterminate />}
    {data.usageError && <Text type="supporting" role="alert">{data.usageError}</Text>}
    {local && data.todayError && <Text type="supporting" role="alert">{data.todayError}</Text>}
    {usage && <UsageWarning usage={usage} platform={account.platform} />}
    {showGemini && <GeminiUsage account={account} usage={usage} settled={data.usageLoaded && !data.usageLoading && !data.usageError && !usage?.error && !usage?.needs_reauth && !usage?.is_forbidden} />}
    {(local || multi) && managed && <ManagedProviderUsage account={account} update={update} />}
    {local && today && <UsageStats stats={today} />}
    {(['daily', 'weekly', 'total'] as const).map(period => {
      const bar = bars[period]
      return bar && <UsageProgressBar key={period} label={labels[period]} {...bar} />
    })}
    {multi && !managed && <CNProviderUsage account={account} update={update} visible={visible} lastProbe={props.lastProbe} />}
    {remote && account.platform === 'anthropic' && <>
      <WindowBar label="5h" progress={usage?.five_hour} /><WindowBar label="7d" progress={usage?.seven_day} withStats={false} />
      <WindowBar label="7d S" progress={usage?.seven_day_sonnet} withStats={false} /><WindowBar label="7d F" progress={usage?.seven_day_fable} withStats={false} />
      {usage?.source === 'passive' && <Text type="supporting">{t('admin.accounts.usageWindow.passiveSampled')}</Text>}
      {account.type === 'oauth' && <ClaudeCredits id={account.id} operation={props.store.creditAction(account.id)} refresh={active} />}
    </>}
    {remote && account.platform === 'openai' && <>
      <WindowBar label="5h" progress={usage?.five_hour} idle /><WindowBar label="7d" progress={usage?.seven_day} idle estimate />
      <OpenAICredits account={account} operation={props.store.creditAction(account.id)} updated={next => update(next.id, next)}
        refresh={next => next ? props.store.active(props.store.row(next)) : active()} />
    </>}
    {remote && account.platform === 'antigravity' && <AntigravityUsage account={account} usage={usage} />}
    {remote && account.platform === 'grok' && <GrokUsage id={account.id} usage={usage} refresh={active} />}
    {accountSupportsActiveUsageQuery(account) && <Button size="sm" variant="ghost" label={t('admin.accounts.usageWindow.activeQuery')}
      isDisabled={data.activeLoading} onClick={() => void active()} />}
    {!remote && !local && !multi && <Text type="supporting">—</Text>}
  </VStack>
}

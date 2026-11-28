import type { ReactNode } from 'react'
import { nextRowKey } from './bulkEditPayload'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { TrashIcon } from '@heroicons/react/24/outline'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import {
  DateTimeInput,
  type ISODateTimeString,
} from '@astryxdesign/core/DateTimeInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import type { Account } from '@/types'
import {
  defaultCNAdaptiveBaseUrls,
  isMultiProtocolApiKeyPlatform,
  providerModeLabel,
  providerAccountModes,
  defaultProviderProtocolRules,
  isHeaderOverrideCapable,
  providerNativeProtocols,
  providerRoutesByModel,
  resolveProviderAccountMode,
  type CnApiProtocol,
  type CnNativeApiProtocol,
} from '@/components/account/credentialsBuilder'
import { OPENAI_IMAGE_SIZE_TIERS } from '@/components/account/openaiImageSizeTiers'
import { useI18n } from '~/i18n'
import { HeaderOverrideRowsEditor } from './HeaderOverrideRowsEditor'
import { ModelWhitelistField } from './ModelWhitelistField'
import type { AccountForm } from './accountForm'

type Props = {
  form: AccountForm
  editing: Account | null
  patch: (fields: Partial<AccountForm>) => void
}
export function AdvancedAccountFields({ form: f, editing, patch }: Props) {
  const { t } = useI18n(),
    l = (key: string) => t(`admin.accounts.${key}`)
  return (
    <VStack gap={4} hAlign="stretch">
      <DateTimeInput
        label={l('expiresAt')}
        value={f.expires ? (f.expires as ISODateTimeString) : undefined}
        onChange={(value) => patch({ expires: value ?? '' })}
        description={l('expiresAtHint')}
      />
      <Switch
        label={l('autoPauseOnExpired')}
        value={f.autoPause}
        onChange={(autoPause) => patch({ autoPause })}
      />
      <Grid columns={{ minWidth: 240, max: 2 }} gap={3} align="end">
        <NumberInput
          label={l('loadFactor')}
          value={f.loadFactor}
          min={1}
          isIntegerOnly
          onChange={(loadFactor) => patch({ loadFactor })}
          description={l('loadFactorHint')}
        />
        <NumberInput
          label={l('billingRateMultiplier')}
          min={0}
          step={0.01}
          value={f.rate}
          isDisabled={f.syncRate}
          onChange={(v) => patch({ rate: v ?? 1 })}
        />
      </Grid>
      {f.type === 'apikey' && (
        <>
          <Switch
            label={l('upstreamBilling.autoProbe')}
            value={f.probe}
            onChange={(probe) =>
              patch({
                probe,
                syncRate: probe && f.syncRate,
                syncGroup: probe && f.syncGroup,
              })
            }
          />
          <Switch
            label={l('upstreamBilling.autoSyncGroup')}
            value={f.syncGroup}
            onChange={(syncGroup) =>
              patch({ syncGroup, probe: syncGroup || f.probe })
            }
          />
          {editing && (
            <Switch
              label={l('upstreamBilling.syncRate')}
              value={f.syncRate}
              isDisabled={!f.probe}
              onChange={(syncRate) => patch({ syncRate })}
            />
          )}
        </>
      )}
      {f.platform === 'antigravity' && (
        <Switch
          label={l('allowOverages')}
          value={f.overages}
          onChange={(overages) => patch({ overages })}
        />
      )}
      {f.platform === 'openai' && (
        <>
          <Text>{l('openai.imageSizeTiers')}</Text>
          <HStack gap={3} wrap="wrap">
            {OPENAI_IMAGE_SIZE_TIERS.map((tier) => (
              <CheckboxInput
                key={tier}
                label={tier}
                value={f.tiers.includes(tier)}
                isDisabled={f.tiers.length === 1 && f.tiers[0] === tier}
                onChange={(checked) =>
                  patch({
                    tiers: OPENAI_IMAGE_SIZE_TIERS.filter((item) =>
                      item === tier ? checked : f.tiers.includes(item),
                    ),
                  })
                }
              />
            ))}
          </HStack>
        </>
      )}
    </VStack>
  )
}

export function ConnectionProtocolFields({ form: f, patch }: Props) {
  const { t } = useI18n()
  const l = (key: string) => t(`admin.accounts.${key}`)
  const plan = resolveProviderAccountMode(f.platform, f.providerMode)
  const adaptive = f.protocol === 'adaptive'
  const protocolLabel = (value: string) =>
    l(
      `cnProviders.apiProtocol.${value === 'chat_completions' ? 'chatCompletions' : value}`,
    )
  if (f.type !== 'apikey' || !isMultiProtocolApiKeyPlatform(f.platform))
    return null
  return (
    <VStack gap={3} hAlign="stretch">
      <Grid columns={{ minWidth: 240, max: 2 }} gap={3}>
        <Selector
          label={l('cnProviders.accountMode.title')}
          value={plan}
          options={providerAccountModes(f.platform).map((value) => ({
            value,
            label: providerModeLabel(value, t),
          }))}
          onChange={(providerMode) =>
            patch({
              providerMode,
              protocol: 'adaptive',
              baseUrl: '',
              endpoints: {},
              rules: defaultProviderProtocolRules(f.platform, providerMode),
            })
          }
        />
        <Selector
          label={l('cnProviders.apiProtocol.title')}
          value={f.protocol}
          options={[
            'adaptive',
            ...providerNativeProtocols(f.platform, plan),
          ].map((value) => ({
            value,
            label: protocolLabel(value),
          }))}
          onChange={(value) =>
            patch({ protocol: value as CnApiProtocol, baseUrl: '' })
          }
        />
      </Grid>
      {adaptive &&
        providerNativeProtocols(f.platform, plan).map((p) => (
          <TextInput
            key={p}
            label={`${protocolLabel(p)} · ${l('baseUrl')}`}
            value={f.endpoints[p] ?? ''}
            placeholder={defaultCNAdaptiveBaseUrls(f.platform, plan)[p]}
            onChange={(value) =>
              patch({ endpoints: { ...f.endpoints, [p]: value } })
            }
          />
        ))}
    </VStack>
  )
}

export function CredentialFields({
  form: f,
  patch,
  syncAction,
  syncHint,
}: Props & { syncAction?: ReactNode; syncHint?: string }) {
  const { t } = useI18n(),
    l = (key: string) => t(`admin.accounts.${key}`)
  const plan = resolveProviderAccountMode(f.platform, f.providerMode)
  const adaptive = f.protocol === 'adaptive'
  const rules = f.rules ?? defaultProviderProtocolRules(f.platform, plan)
  const protocols = [
    ...new Set([
      ...providerNativeProtocols(f.platform, plan),
      ...rules.flatMap((row) => [row.protocol, ...(row.extraProtocols ?? [])]),
    ]),
  ]
  const protocolLabel = (v: string) =>
    l(
      `cnProviders.apiProtocol.${v === 'chat_completions' ? 'chatCompletions' : v}`,
    )
  return (
    <VStack gap={4} hAlign="stretch">
      <VStack gap={3} hAlign="stretch">
        <Text type="label">{l('modelWhitelist')}</Text>
        <ModelWhitelistField
          syncAction={syncAction}
          value={f.whitelist}
          modelMappings={f.aliases}
          platforms={[f.platform]}
          onChange={(whitelist) => patch({ whitelist })}
        />
        {syncHint && <Text type="supporting">{syncHint}</Text>}
      </VStack>
      <VStack gap={3} hAlign="stretch">
        <Text weight="medium">{l('modelMapping')}</Text>
        {f.aliases.map((row) => (
          <HStack key={row.key} gap={2} vAlign="end">
            <StackItem size="fill">
              <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
                <TextInput
                  label={l('fromModel')}
                  value={row.from}
                  onChange={(from) =>
                    patch({
                      aliases: f.aliases.map((v) =>
                        v.key === row.key ? { ...v, from } : v,
                      ),
                    })
                  }
                />
                <TextInput
                  label={l('toModel')}
                  value={row.to}
                  onChange={(to) =>
                    patch({
                      aliases: f.aliases.map((v) =>
                        v.key === row.key ? { ...v, to } : v,
                      ),
                    })
                  }
                />
              </Grid>
            </StackItem>
            <IconButton
              variant="ghost"
              icon={<Icon icon={TrashIcon} />}
              tooltip={t('common.remove')}
              label={t('common.remove')}
              onClick={() =>
                patch({ aliases: f.aliases.filter((v) => v.key !== row.key) })
              }
            />
          </HStack>
        ))}
        <HStack>
          <Button
            size="sm"
            label={l('addMapping')}
            onClick={() =>
              patch({
                aliases: [
                  ...f.aliases,
                  { key: nextRowKey(), from: '', to: '' },
                ],
              })
            }
          />
        </HStack>
      </VStack>
      {isHeaderOverrideCapable(f.platform, f.type) && (
        <>
          <Switch
            label={l('headerOverride.title')}
            value={f.headerEnabled}
            onChange={(headerEnabled) => patch({ headerEnabled })}
          />
          {f.headerEnabled && (
            <HeaderOverrideRowsEditor
              rows={f.headerRows}
              onChange={(headerRows) => patch({ headerRows })}
            />
          )}
        </>
      )}
      {f.type === 'apikey' && providerRoutesByModel(f.platform) && adaptive && (
        <>
          <Collapsible trigger={l('opencodeGo.protocolRules.title')}>
            <VStack gap={4} hAlign="stretch">
              {rules.map((r, i) => (
                <VStack key={i} gap={3} hAlign="stretch">
                  <HStack gap={2} vAlign="end">
                    <StackItem size="fill">
                      <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
                        <TextInput
                          label={t('astryx.accountModelPattern')}
                          placeholder={l(
                            'opencodeGo.protocolRules.patternPlaceholder',
                          )}
                          value={r.pattern}
                          onChange={(pattern) =>
                            patch({
                              rules: rules.map((v, j) =>
                                i === j ? { ...v, pattern } : v,
                              ),
                            })
                          }
                        />
                        <Selector
                          label={l('cnProviders.apiProtocol.title')}
                          value={r.protocol}
                          options={protocols.map((value) => ({
                            value,
                            label: protocolLabel(value),
                          }))}
                          onChange={(v) =>
                            patch({
                              rules: rules.map((row, j) =>
                                i === j
                                  ? {
                                      ...row,
                                      protocol: v as CnNativeApiProtocol,
                                      extraProtocols:
                                        row.extraProtocols?.filter(
                                          (p) => p !== v,
                                        ),
                                    }
                                  : row,
                              ),
                            })
                          }
                        />
                      </Grid>
                    </StackItem>
                    <IconButton
                      variant="ghost"
                      icon={<Icon icon={TrashIcon} />}
                      tooltip={l('opencodeGo.protocolRules.remove')}
                      label={l('opencodeGo.protocolRules.remove')}
                      onClick={() =>
                        patch({ rules: rules.filter((_, j) => i !== j) })
                      }
                    />
                  </HStack>
                  <HStack gap={3} wrap="wrap" vAlign="center">
                    <Text type="supporting">
                      {l('opencodeGo.protocolRules.alsoSupports')}
                    </Text>
                    {protocols
                      .filter((p) => p !== r.protocol)
                      .map((p) => (
                        <CheckboxInput
                          key={p}
                          label={protocolLabel(p)}
                          value={!!r.extraProtocols?.includes(p)}
                          onChange={(enabled) =>
                            patch({
                              rules: rules.map((row, j) =>
                                i !== j
                                  ? row
                                  : {
                                      ...row,
                                      extraProtocols: enabled
                                        ? [...(row.extraProtocols ?? []), p]
                                        : row.extraProtocols?.filter(
                                            (x) => x !== p,
                                          ),
                                    },
                              ),
                            })
                          }
                        />
                      ))}
                  </HStack>
                </VStack>
              ))}
              <HStack gap={2} wrap="wrap">
                <Button
                  label={l('opencodeGo.protocolRules.add')}
                  onClick={() =>
                    patch({
                      rules: [
                        ...rules,
                        {
                          pattern: '',
                          protocol: protocols[0] ?? 'chat_completions',
                        },
                      ],
                    })
                  }
                />
                <Button
                  label={l('opencodeGo.protocolRules.restoreDefaults')}
                  onClick={() =>
                    patch({
                      rules: defaultProviderProtocolRules(f.platform, plan),
                    })
                  }
                />
              </HStack>
            </VStack>
          </Collapsible>
        </>
      )}
    </VStack>
  )
}

import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { Section } from '@astryxdesign/core/Section'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { ArrowDownTrayIcon, ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { SetupHint } from './SetupHint'
import type { CodexCatalog } from './types'
import type { CodexCatalogControl } from './useCodexCatalog'

interface CodexCatalogPanelProps {
  control: CodexCatalogControl
  /** Where Codex reads the catalog in the selected mode: the gateway address or the local file. */
  location: string
  /** Fetching signs in with the key, so there is nothing to fetch without one. */
  canFetch: boolean
}

/** Chooses where Codex reads its model catalog from, and fetches the catalog to save it as a file. */
export function CodexCatalogPanel({ control, location, canFetch }: CodexCatalogPanelProps) {
  const { t } = useI18n()
  const { mode } = control.catalog
  // Saving the file is the step to take in file mode; with the remote catalog fetching is optional.
  const actionVariant = mode === 'file' ? 'primary' : 'secondary'

  return (
    <Section variant="muted" padding={4}>
      <VStack gap={3}>
        <HStack gap={3} vAlign="start" wrap="wrap">
          <StackItem size="fill">
            <VStack gap={1}>
              <Text as="h3" type="label">
                {t('keys.useKeyModal.codexModelCatalog.title')}
              </Text>
              <Text type="supporting" color="secondary">
                {t('keys.useKeyModal.codexModelCatalog.description')}
              </Text>
              <Text type="code" wordBreak="break-all">
                {location}
              </Text>
            </VStack>
          </StackItem>
          {control.status === 'ready' ? (
            <Button
              size="sm"
              variant={actionVariant}
              label={t('keys.useKeyModal.codexModelCatalog.download')}
              icon={<Icon icon={ArrowDownTrayIcon} />}
              onClick={control.download}
            />
          ) : (
            <Button
              size="sm"
              variant={actionVariant}
              label={
                control.status === 'error'
                  ? t('keys.useKeyModal.codexModelCatalog.retry')
                  : t('keys.useKeyModal.codexModelCatalog.fetch')
              }
              icon={<Icon icon={ArrowPathIcon} />}
              isLoading={control.status === 'loading'}
              isDisabled={!canFetch}
              onClick={control.load}
            />
          )}
        </HStack>

        <SegmentedControl
          value={mode}
          onChange={(next) => control.selectMode(next as CodexCatalog['mode'])}
          label={t('keys.useKeyModal.codexModelCatalog.mode')}
          layout="fill"
        >
          <SegmentedControlItem
            value="remote"
            label={t('keys.useKeyModal.codexModelCatalog.remote')}
            isDisabled={control.isOversized}
          />
          <SegmentedControlItem value="file" label={t('keys.useKeyModal.codexModelCatalog.local')} />
        </SegmentedControl>

        {control.isOversized && <SetupHint text={t('keys.useKeyModal.codexModelCatalog.oversized')} />}

        {control.status === 'ready' && (
          <HStack gap={1.5} vAlign="center">
            <Icon icon={CheckCircleIcon} size="sm" color="success" />
            <Text type="supporting">
              {t('keys.useKeyModal.codexModelCatalog.modelsCount', { count: control.modelCount })}
            </Text>
          </HStack>
        )}
        {control.status === 'error' && (
          <Banner status="error" title={t('keys.useKeyModal.codexModelCatalog.errorDescription')} />
        )}
      </VStack>
    </Section>
  )
}

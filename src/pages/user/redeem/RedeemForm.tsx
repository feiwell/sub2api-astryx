import { useRef } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { GiftIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { outcomeLines } from './redeemModel'
import type { RedeemCode, RedeemResult } from './useRedeemCode'

/** How the last code went; it stays until the next one is sent. */
function ResultBanner({ result }: { result: RedeemResult }) {
  const { t } = useI18n()
  if (!result.isRedeemed) {
    return (
      <Banner
        status="error"
        title={t('redeem.redeemFailed')}
        description={result.reason || t('redeem.failedToRedeem')}
      />
    )
  }
  const lines = outcomeLines(result.outcome, t)
  return (
    <Banner
      status="success"
      title={t('redeem.redeemSuccess')}
      description={
        lines.length > 0 && (
          <VStack gap={0}>
            {lines.map((line) => (
              <Text key={line} type="inherit" color="inherit">
                {line}
              </Text>
            ))}
          </VStack>
        )
      }
    />
  )
}

/** The field for a code and the button that redeems it, with how the last code went underneath. */
export function RedeemForm({ redeem }: { redeem: RedeemCode }) {
  const { t } = useI18n()
  const form = useRef<HTMLElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const submit = () => {
    void redeem.submit().then((isRedeemed) => {
      // The button goes inactive once the field is empty again, which would drop a focus left on it.
      if (isRedeemed && form.current?.contains(document.activeElement)) field.current?.focus()
    })
  }

  return (
    <>
      <Card>
        <VStack gap={4} ref={form}>
          <TextInput
            ref={field}
            label={t('redeem.redeemCodeLabel')}
            description={t('redeem.redeemCodeHint')}
            placeholder={t('redeem.redeemCodePlaceholder')}
            startIcon={GiftIcon}
            width="100%"
            value={redeem.code}
            onChange={redeem.changeCode}
            onEnter={submit}
            // Read-only, not disabled, while a code is on its way: the field keeps the focus.
            isReadOnly={redeem.isSubmitting}
            status={redeem.isMissing ? { type: 'error', message: t('redeem.pleaseEnterCode') } : undefined}
            // Codes are case-sensitive: nothing may capitalise or correct what is typed.
            autoComplete="off"
            autoCapitalize="none"
            hasAutoCorrect={false}
            hasSpellCheck={false}
          />
          <Button
            variant="primary"
            width="100%"
            label={redeem.isSubmitting ? t('redeem.redeeming') : t('redeem.redeemButton')}
            isLoading={redeem.isSubmitting}
            isDisabled={!redeem.code.trim()}
            onClick={submit}
          />
        </VStack>
      </Card>
      {redeem.result && <ResultBanner result={redeem.result} />}
    </>
  )
}

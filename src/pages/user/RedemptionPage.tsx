import { useEffect } from 'react'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { useAuthStore } from '~/stores/auth'
import { AboutCodes } from './redeem/AboutCodes'
import { BalanceCards } from './redeem/BalanceCards'
import { HistoryCard } from './redeem/HistoryCard'
import { RedeemForm } from './redeem/RedeemForm'
import { useRedeemCode } from './redeem/useRedeemCode'
import { useRedeemHistory } from './redeem/useRedeemHistory'

// The width of the Vue page's column (max-w-2xl).
const COLUMN_WIDTH = 672

/**
 * Redeeming a code: what the account has now, the field for a code, what to know about codes, and the codes
 * used so far along with the changes administrators made. Port of views/user/RedeemView.vue.
 */
export function RedemptionPage() {
  const { t } = useI18n()
  const user = useAuthStore((state) => state.user)
  const refreshUser = useAuthStore((state) => state.refreshUser)
  const contactInfo = useAppStore((state) => state.contactInfo)
  const history = useRedeemHistory()
  const redeem = useRedeemCode(history.showNewest)

  // The contact details are asked for anew on every visit, as in the Vue page: they may have changed.
  useEffect(() => {
    void useAppStore.getState().fetchPublicSettings(true)
  }, [])

  const refresh = () => {
    history.reload()
    refreshUser().catch((error: unknown) => {
      console.error('[redeem] failed to refresh the account', error)
    })
  }

  return (
    <Page
      title={t('redeem.title')}
      description={t('redeem.description')}
      actions={
        <IconButton
          label={t('common.refresh')}
          tooltip={t('common.refresh')}
          icon={<Icon icon={ArrowPathIcon} />}
          isLoading={history.isLoading}
          onClick={refresh}
        />
      }
    >
      <HStack hAlign="center">
        <VStack gap={4} width="100%" maxWidth={COLUMN_WIDTH}>
          <BalanceCards balance={user?.balance ?? 0} concurrency={user?.concurrency ?? 0} />
          <RedeemForm redeem={redeem} />
          <AboutCodes contactInfo={contactInfo} />
          <HistoryCard history={history} isRedeeming={redeem.isSubmitting} />
        </VStack>
      </HStack>
    </Page>
  )
}

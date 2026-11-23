import { VStack } from '@astryxdesign/core/Stack'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { AffiliateRecordsTable } from './affiliates/AffiliateRecordsTable'

export function AdminAffiliateTransfersPage() {
  const { t } = useI18n()

  return (
    <Page
      title={t('nav.affiliateTransferRecords')}
      description={t('admin.affiliates.transfersDescription')}
    >
      <VStack gap={4} hAlign="stretch">
        <AffiliateRecordsTable type="transfers" />
      </VStack>
    </Page>
  )
}

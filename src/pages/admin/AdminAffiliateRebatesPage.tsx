import { VStack } from '@astryxdesign/core/Stack'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { AffiliateRecordsTable } from './affiliates/AffiliateRecordsTable'

export function AdminAffiliateRebatesPage() {
  const { t } = useI18n()

  return (
    <Page
      title={t('nav.affiliateRebateRecords')}
      description={t('admin.affiliates.rebatesDescription')}
    >
      <VStack gap={4} hAlign="stretch">
        <AffiliateRecordsTable type="rebates" />
      </VStack>
    </Page>
  )
}

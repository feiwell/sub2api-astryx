import { VStack } from '@astryxdesign/core/Stack'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { AffiliateRecordsTable } from './affiliates/AffiliateRecordsTable'

export function AdminAffiliateInvitesPage() {
  const { t } = useI18n()

  return (
    <Page
      title={t('nav.affiliateInviteRecords')}
      description={t('admin.affiliates.invitesDescription')}
    >
      <VStack gap={4} hAlign="stretch">
        <AffiliateRecordsTable type="invites" />
      </VStack>
    </Page>
  )
}

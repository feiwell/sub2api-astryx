import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'

/** What to know about codes, and whom to ask when one does not work. */
export function AboutCodes({ contactInfo }: { contactInfo: string }) {
  const { t } = useI18n()
  return (
    <Card>
      <List
        listStyle="disc"
        density="compact"
        edge="flush"
        header={
          <HStack gap={2} vAlign="center">
            <Icon icon={InformationCircleIcon} color="accent" />
            <Heading level={4}>{t('redeem.aboutCodes')}</Heading>
          </HStack>
        }
      >
        {/* Each rule is a Text so it wraps: a plain string label is cut to one line. */}
        <ListItem label={<Text>{t('redeem.codeRule1')}</Text>} />
        <ListItem label={<Text>{t('redeem.codeRule2')}</Text>} />
        <ListItem
          label={
            <Text>
              {t('redeem.codeRule3')}
              {contactInfo && (
                <>
                  {' '}
                  <Text type="inherit" weight="semibold">
                    {contactInfo}
                  </Text>
                </>
              )}
            </Text>
          }
        />
        <ListItem label={<Text>{t('redeem.codeRule4')}</Text>} />
      </List>
    </Card>
  )
}

import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { Icon } from '@astryxdesign/core/Icon'
import { Token } from '@astryxdesign/core/Token'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Table, type TableColumn } from '@astryxdesign/core/Table'
import {
  ArrowRightIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  BookOpenIcon,
  ChartBarIcon,
  CheckCircleIcon,
  KeyIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { sanitizeUrl } from '@/utils/url'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { ANTIGRAVITY, CLAUDE, GEMINI, GPT } from './providerBrands'
import { QuickStart } from './QuickStart'

const COMPARISON_ROWS = ['pricing', 'models', 'management', 'stability', 'control'] as const

interface ComparisonRow extends Record<string, unknown> {
  key: string
  feature: string
  official: string
  ours: string
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <VStack gap={2} hAlign="center">
      <Heading level={2} justify="center" textWrap="balance">
        {title}
      </Heading>
      {description && (
        <Text color="secondary" justify="center" textWrap="balance">
          {description}
        </Text>
      )}
    </VStack>
  )
}

/**
 * The default landing content of the home page: the pitch, one key fanning out to the providers
 * it reaches with a sample request for each, the reasons to choose the site next to a comparison
 * with official subscriptions, and a closing call to action.
 */
export function HomeLanding({
  eyebrow,
  startHref,
  startLabel,
}: {
  /** The short line above the title: the site's subtitle, led by its name where the top bar has no room for it. */
  eyebrow: string
  /** Where the main button leads: the dashboard when signed in, the login page otherwise. */
  startHref: string
  startLabel: string
}) {
  const { t } = useI18n()
  const docUrl = sanitizeUrl(useAppStore((s) => s.docUrl) || '')
  const apiBaseUrl = useAppStore((s) => s.apiBaseUrl)

  const tags = [
    { icon: ArrowsRightLeftIcon, label: t('home.tags.subscriptionToApi') },
    { icon: ShieldCheckIcon, label: t('home.tags.stickySession') },
    { icon: ChartBarIcon, label: t('home.tags.realtimeBilling') },
  ]
  const providers = [
    { brand: CLAUDE, name: t('home.providers.claude') },
    { brand: GPT, name: 'GPT' },
    { brand: GEMINI, name: t('home.providers.gemini') },
    { brand: ANTIGRAVITY, name: t('home.providers.antigravity') },
  ]
  const features = [
    { icon: ServerStackIcon, title: t('home.features.unifiedGateway'), description: t('home.features.unifiedGatewayDesc') },
    { icon: UserGroupIcon, title: t('home.features.multiAccount'), description: t('home.features.multiAccountDesc') },
    { icon: BanknotesIcon, title: t('home.features.balanceQuota'), description: t('home.features.balanceQuotaDesc') },
  ]
  const comparison: ComparisonRow[] = COMPARISON_ROWS.map((key) => ({
    key,
    feature: t(`home.comparison.items.${key}.feature`),
    official: t(`home.comparison.items.${key}.official`),
    ours: t(`home.comparison.items.${key}.us`),
  }))
  const comparisonColumns: TableColumn<ComparisonRow>[] = [
    {
      key: 'feature',
      header: t('home.comparison.headers.feature'),
      renderCell: (row) => <Text weight="medium">{row.feature}</Text>,
    },
    {
      key: 'official',
      header: t('home.comparison.headers.official'),
      renderCell: (row) => <Text color="secondary">{row.official}</Text>,
    },
    {
      key: 'ours',
      header: t('home.comparison.headers.us'),
      renderCell: (row) => (
        <HStack gap={1.5} vAlign="center">
          <Icon icon={CheckCircleIcon} size="sm" color="success" />
          <Text weight="medium">{row.ours}</Text>
        </HStack>
      ),
    },
  ]

  const startButton = (
    <Button
      variant="primary"
      size="lg"
      href={startHref}
      label={startLabel}
      endContent={<Icon icon={ArrowRightIcon} size="sm" color="inherit" />}
    />
  )

  return (
    <Layout
      className="home-landing"
      height="auto"
      contentWidth={1040}
      content={
        <LayoutContent padding={6}>
          <VStack gap={10} paddingBlock={8}>
            {/* Pitch */}
            <VStack gap={6} hAlign="center">
              <VStack gap={4} hAlign="center" maxWidth={820}>
                <Badge label={eyebrow} />
                {/* keep-all: a Chinese title wraps at its punctuation and spaces, not inside a word. */}
                <Heading
                  level={1}
                  type="display-1"
                  justify="center"
                  textWrap="balance"
                  style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
                >
                  {t('home.heroSubtitle')}
                </Heading>
                <Text type="large" color="secondary" justify="center" textWrap="balance">
                  {t('home.heroDescription')}
                </Text>
              </VStack>
              <HStack gap={3} hAlign="center" wrap="wrap">
                {startButton}
                {docUrl && (
                  <Button
                    variant="secondary"
                    size="lg"
                    href={docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    label={t('home.viewDocs')}
                    icon={<Icon icon={BookOpenIcon} size="sm" />}
                  />
                )}
              </HStack>
              <HStack gap={2} hAlign="center" wrap="wrap">
                {tags.map((tag) => (
                  <Token key={tag.label} icon={<Icon icon={tag.icon} color="accent" />} label={tag.label} />
                ))}
              </HStack>
            </VStack>

            {/* One key fanning out to the providers, then a sample request for each protocol */}
            <VStack gap={5} hAlign="center">
              <SectionTitle title={t('home.providers.title')} description={t('home.providers.description')} />
              <VStack gap={2} hAlign="center" width="100%">
                <Token size="lg" icon={<Icon icon={KeyIcon} color="accent" />} label={t('astryx.homeOneKey')} />
                <Icon icon="arrowDown" size="sm" color="tertiary" />
                <Grid columns={{ minWidth: 150, max: 4 }} gap={3} width="100%">
                  {providers.map(({ brand, name }) => (
                    <Card key={name} padding={4}>
                      <HStack gap={3} vAlign="center">
                        <Icon icon={brand} size="lg" />
                        <VStack gap={0.5}>
                          <Text weight="bold">{name}</Text>
                          <HStack gap={1.5} vAlign="center">
                            <StatusDot variant="success" label={t('home.providers.supported')} />
                            <Text type="supporting" color="secondary">
                              {t('home.providers.supported')}
                            </Text>
                          </HStack>
                        </VStack>
                      </HStack>
                    </Card>
                  ))}
                </Grid>
              </VStack>
              <Token color="gray" label={`${t('home.providers.more')} · ${t('home.providers.soon')}`} />
              <QuickStart apiBaseUrl={apiBaseUrl} label={t('home.providers.title')} />
            </VStack>

            {/* Reasons to choose the site, then the comparison with official subscriptions */}
            <VStack gap={5}>
              <SectionTitle title={t('home.comparison.title')} />
              <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
                {features.map((feature) => (
                  <Card key={feature.title} padding={6}>
                    <VStack gap={3}>
                      <Icon icon={feature.icon} size="lg" color="accent" />
                      <Heading level={3}>{feature.title}</Heading>
                      <Text color="secondary">{feature.description}</Text>
                    </VStack>
                  </Card>
                ))}
              </Grid>
              <Card padding={2}>
                <Table data={comparison} columns={comparisonColumns} idKey="key" />
              </Card>
            </VStack>

            {/* Closing call to action */}
            <Card padding={8}>
              <VStack gap={4} hAlign="center">
                <Heading level={2} justify="center" textWrap="balance">
                  {t('home.cta.title')}
                </Heading>
                {startButton}
              </VStack>
            </Card>
          </VStack>
        </LayoutContent>
      }
    />
  )
}

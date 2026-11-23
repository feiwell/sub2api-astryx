import { useMemo } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { LayoutContent } from '@astryxdesign/core/Layout'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import type { CustomMenuItem } from '@/types'
import { buildEmbeddedUrl } from '@/utils/embedded-url'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { useAuthStore } from '~/stores/auth'
import { PageEmptyState, PageFrame } from './PageFrame'

/** A web page shown inside the console. */
export function EmbeddedPageView({ item }: { item: CustomMenuItem }) {
  const { t, locale } = useI18n()
  const userId = useAuthStore((s) => s.user?.id)
  const token = useAuthStore((s) => s.token)
  const colorMode = useAppStore((s) => s.colorMode)
  // The address tells the embedded page who is looking (user id and login token) and which
  // theme and language to use, so it reloads when one of those changes.
  const url = useMemo(
    () => buildEmbeddedUrl(item.url, userId, token, colorMode, locale),
    [item.url, userId, token, colorMode, locale],
  )

  if (!/^https?:\/\//.test(url)) {
    return (
      <PageFrame
        title={item.label}
        content={
          <LayoutContent padding={6}>
            <PageEmptyState
              title={t('customPage.notConfiguredTitle')}
              description={t('customPage.notConfiguredDesc')}
            />
          </LayoutContent>
        }
      />
    )
  }

  return (
    <PageFrame
      title={item.label}
      actions={
        !item.hide_open_button && (
          <Button
            label={t('customPage.openInNewTab')}
            icon={<Icon icon={ArrowTopRightOnSquareIcon} />}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          />
        )
      }
      content={
        <LayoutContent padding={0} isScrollable={false}>
          <iframe src={url} title={item.label} width="100%" height="100%" frameBorder={0} allowFullScreen />
        </LayoutContent>
      }
    />
  )
}

import { useMemo } from 'react'
import { Section } from '@astryxdesign/core/Section'
import { HStack } from '@astryxdesign/core/Stack'
import { Badge } from '@astryxdesign/core/Badge'
import { Text } from '@astryxdesign/core/Text'
import {
  Typeahead,
  TypeaheadItem,
  type SearchableItem,
  type SearchSource,
} from '@astryxdesign/core/Typeahead'
import type { AdminGroup, AdminUser } from '@/types'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { groupPlatformLabel } from './groupPlatform'

// Shared pieces of the per-user rate-multiplier and RPM-override dialogs.

type UserOption = SearchableItem<AdminUser>

const toUserOption = (user: AdminUser): UserOption => ({
  id: String(user.id),
  label: user.email,
  auxiliaryData: user,
})

/** Platform, name and the group-level default the per-user values override. */
export function GroupSummary({ group, metric }: { group: AdminGroup; metric: string }) {
  const { t } = useI18n()
  return (
    <Section variant="muted" padding={3}>
      <HStack gap={3} vAlign="center" wrap="wrap">
        <Badge variant="info" label={groupPlatformLabel(t, group.platform)} />
        <Text weight="medium">{group.name}</Text>
        <Text type="supporting">{metric}</Text>
      </HStack>
    </Section>
  )
}

interface GroupUserSearchProps {
  value: AdminUser | null
  onChange: (user: AdminUser | null) => void
}

/** Debounced user lookup: the first 10 users matching the query. */
export function GroupUserSearch({ value, onChange }: GroupUserSearchProps) {
  const { t } = useI18n()

  const searchSource = useMemo<SearchSource<UserOption>>(
    () => ({
      async search(query) {
        const search = query.trim()
        if (!search) return []
        try {
          const res = await adminAPI.users.list(1, 10, { search })
          return res.items.map(toUserOption)
        } catch {
          return []
        }
      },
      bootstrap: () => [],
    }),
    [],
  )
  const selected = useMemo(() => (value ? toUserOption(value) : null), [value])

  return (
    <Typeahead
      label={t('admin.groups.columns.userEmail')}
      isLabelHidden
      placeholder={t('admin.groups.searchUserPlaceholder')}
      searchSource={searchSource}
      value={selected}
      onChange={(item) => onChange(item?.auxiliaryData ?? null)}
      debounceMs={300}
      emptySearchText={t('astryx.groupsAdmin.dialogs.noUserFound')}
      renderItem={(item) => {
        const user = item.auxiliaryData
        return (
          <TypeaheadItem
            item={item}
            description={user ? `#${user.id}${user.username ? ` · ${user.username}` : ''}` : undefined}
          />
        )
      }}
    />
  )
}

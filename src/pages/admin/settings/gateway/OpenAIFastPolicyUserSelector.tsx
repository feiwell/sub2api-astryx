import { useEffect, useMemo, useRef, useState } from 'react'
import { Tokenizer, type TokenizerChange } from '@astryxdesign/core/Tokenizer'
import { TypeaheadItem, type SearchableItem, type SearchSource } from '@astryxdesign/core/Typeahead'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'

interface UserInfo {
  email: string
  deleted: boolean
}

type UserItem = SearchableItem<UserInfo>

interface Props {
  label: string
  description?: string
  value: number[]
  onChange: (userIds: number[]) => void
}

export function OpenAIFastPolicyUserSelector({ label, description, value, onChange }: Props) {
  const { t } = useI18n()
  const [knownUsers, setKnownUsers] = useState<Record<number, UserInfo>>({})
  // Ids already looked up or picked from search, so a failed lookup is not retried on every render.
  const resolvedIds = useRef(new Set<number>())

  // A string key keeps the id list stable while the parent passes a fresh array on every render.
  const selectedKey = Array.from(new Set(value.filter((id) => Number.isInteger(id) && id > 0))).join(',')
  const selectedUserIds = useMemo(() => (selectedKey ? selectedKey.split(',').map(Number) : []), [selectedKey])

  useEffect(() => {
    const missing = selectedUserIds.filter((id) => !resolvedIds.current.has(id))
    if (missing.length === 0) return
    missing.forEach((id) => resolvedIds.current.add(id))

    void Promise.all(
      missing.map(async (id) => {
        try {
          const user = await adminAPI.users.getById(id, true)
          return [id, { email: user.email, deleted: Boolean(user.deleted_at) }] as const
        } catch {
          return null
        }
      }),
    ).then((results) => {
      const found = results.filter((entry) => entry !== null)
      if (found.length > 0) {
        setKnownUsers((prev) => ({ ...prev, ...Object.fromEntries(found) }))
      }
    })
  }, [selectedUserIds])

  const selectedItems = useMemo<UserItem[]>(
    () =>
      selectedUserIds.map((id) => {
        const user = knownUsers[id]
        if (!user) {
          return { id: String(id), label: t('admin.settings.openaiFastPolicy.userIdFallback', { id }) }
        }
        const deletedMark = user.deleted ? ` ${t('admin.settings.openaiFastPolicy.userDeleted')}` : ''
        return { id: String(id), label: `${user.email} #${id}${deletedMark}`, auxiliaryData: user }
      }),
    [selectedUserIds, knownUsers, t],
  )

  const searchSource = useMemo<SearchSource<UserItem>>(
    () => ({
      async search(query) {
        const keyword = query.trim()
        if (!keyword) return []
        try {
          const users = await adminAPI.usage.searchUsers(keyword)
          return (users || [])
            .filter((user) => !selectedUserIds.includes(user.id))
            .sort((a, b) => Number(!!a.deleted) - Number(!!b.deleted))
            .map((user) => ({
              id: String(user.id),
              label: user.email,
              auxiliaryData: { email: user.email, deleted: !!user.deleted },
            }))
        } catch {
          return []
        }
      },
      bootstrap: () => [],
    }),
    [selectedUserIds],
  )

  const handleChange = (items: UserItem[], change: TokenizerChange<UserItem>) => {
    if (change.type === 'add' && change.item.auxiliaryData) {
      const id = Number(change.item.id)
      const user = change.item.auxiliaryData
      resolvedIds.current.add(id)
      setKnownUsers((prev) => ({ ...prev, [id]: user }))
    }
    onChange(items.map((item) => Number(item.id)))
  }

  return (
    <Tokenizer
      label={label}
      description={description}
      placeholder={t('admin.settings.openaiFastPolicy.userSearchPlaceholder')}
      emptySearchText={t('admin.settings.openaiFastPolicy.userSearchEmpty')}
      searchSource={searchSource}
      value={selectedItems}
      onChange={handleChange}
      debounceMs={300}
      renderItem={(item) => (
        <TypeaheadItem
          item={item}
          description={
            item.auxiliaryData?.deleted
              ? `#${item.id} ${t('admin.settings.openaiFastPolicy.userDeleted')}`
              : `#${item.id}`
          }
        />
      )}
    />
  )
}

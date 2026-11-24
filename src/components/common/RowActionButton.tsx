import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'

export function RowActionButton({ action, onClick }: { action: 'edit' | 'delete'; onClick: () => void }) {
  const { t } = useI18n()
  const label = t(`common.${action}`)
  return (
    <IconButton
      className={`row-action-${action}`}
      variant="ghost"
      size="sm"
      label={label}
      tooltip={label}
      icon={<Icon icon={action === 'edit' ? PencilSquareIcon : TrashIcon} />}
      onClick={onClick}
    />
  )
}

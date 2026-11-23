import { BackupPanel } from '../AdminBackupPage'

/**
 * Backup tab of the settings page. As in SettingsView.vue, it embeds the backup view itself:
 * backup settings live behind /admin/backups/*, not in the /admin/settings payload.
 */
export function BackupSettingsTab() {
  return <BackupPanel />
}

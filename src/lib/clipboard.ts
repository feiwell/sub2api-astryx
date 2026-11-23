/** Port of composables/useClipboard.ts: copy text with a fallback and a toast. */
import { t } from '~/i18n'
import { toast } from '~/lib/toast'

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(textarea)
  textarea.focus({ preventScroll: true })
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

/** Copies `text`; shows a success toast (custom message optional) or a failure toast. */
export async function copyToClipboard(text: string, successMessage?: string): Promise<boolean> {
  if (!text) return false
  let ok = false
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      ok = fallbackCopy(text)
    }
  } else {
    ok = fallbackCopy(text)
  }
  if (ok) toast.success(successMessage || t('common.copiedToClipboard'))
  else toast.error(t('common.copyFailed'))
  return ok
}

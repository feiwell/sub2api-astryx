import { useEffect } from 'react'
import { useToast, type ShowToastFn } from '@astryxdesign/core/Toast'

/**
 * Lets non-component code (stores, API helpers, event handlers outside the
 * tree) raise Astryx toasts. <ToastBridge /> registers the active host.
 */
let show: ShowToastFn | null = null

export function ToastBridge() {
  const showToast = useToast()
  useEffect(() => {
    show = showToast
    return () => {
      if (show === showToast) show = null
    }
  }, [showToast])
  return null
}

function emit(type: 'info' | 'error', body: string, autoHideDuration?: number) {
  if (!show) {
    console[type === 'error' ? 'error' : 'info']('[toast]', body)
    return
  }
  const autoHide = autoHideDuration ? { isAutoHide: true, autoHideDuration } : {}
  show({ body, type, uniqueID: `${type}:${body}`, ...autoHide })
}

export const toast = {
  success: (message: string) => emit('info', message, 3000),
  info: (message: string) => emit('info', message),
  warning: (message: string) => emit('info', message, 6000),
  error: (message: string) => emit('error', message, 5000),
}

/** Port of composables/useBatchImageAccess.ts: does the user own a key that may batch-generate images? */
import { create } from 'zustand'
import { keysAPI } from '@/api/keys'
import type { ApiKey } from '@/types'

function keyAllowsBatchImage(key: ApiKey): boolean {
  return key.status === 'active' && key.group?.platform === 'gemini' && key.group?.allow_batch_image_generation === true
}

let pending: Promise<boolean> | null = null

interface BatchImageAccessState {
  loaded: boolean
  canUseBatchImage: boolean
  refresh: (force?: boolean) => Promise<boolean>
}

export const useBatchImageAccess = create<BatchImageAccessState>((set, get) => ({
  loaded: false,
  canUseBatchImage: false,
  async refresh(force = false) {
    if (get().loaded && !force) return get().canUseBatchImage
    if (pending && !force) return pending
    pending = (async () => {
      for (let page = 1; ; page++) {
        const res = await keysAPI.list(page, 100, { status: 'active', sort_by: 'created_at', sort_order: 'desc' })
        if ((res.items || []).some(keyAllowsBatchImage)) return true
        if (page >= res.pages || (res.items || []).length === 0) return false
      }
    })()
      .then((allowed) => {
        set({ loaded: true, canUseBatchImage: allowed })
        return allowed
      })
      .catch(() => {
        set({ loaded: false, canUseBatchImage: false })
        return false
      })
      .finally(() => {
        pending = null
      })
    return pending
  },
}))

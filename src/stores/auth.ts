/**
 * Authentication store — React port of frontend/src/stores/auth.ts.
 * Keeps the same localStorage keys and refresh timing so sessions are shared
 * with the Vue frontend and the axios interceptor in api/client.ts.
 */
import { create } from 'zustand'
import { authAPI, isTotp2FARequired, passkeyAPI, type LoginResponse } from '@/api'
import type { User, LoginRequest, RegisterRequest, AuthResponse, ActionCaptchaRequestProof } from '@/types'
import { pollWhileVisible } from '~/lib/visiblePolling'

const AUTH_TOKEN_KEY = 'auth_token'
const AUTH_USER_KEY = 'auth_user'
const REFRESH_TOKEN_KEY = 'refresh_token'
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at'
const PENDING_AUTH_SESSION_KEY = 'pending_auth_session'
const AUTO_REFRESH_INTERVAL = 60 * 1000
const TOKEN_REFRESH_BUFFER = 120 * 1000

type PendingAuthTokenField = 'pending_auth_token' | 'pending_oauth_token'

export interface PendingAuthSessionSummary {
  token: string
  token_field: PendingAuthTokenField
  provider: string
  redirect?: string
  adoption_required?: boolean
  suggested_display_name?: string
  suggested_avatar_url?: string
}

function readPendingAuthSession(): PendingAuthSessionSummary | null {
  const raw = localStorage.getItem(PENDING_AUTH_SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingAuthSessionSummary> | null
    const provider = typeof parsed?.provider === 'string' ? parsed.provider.trim() : ''
    if (!provider) {
      localStorage.removeItem(PENDING_AUTH_SESSION_KEY)
      return null
    }
    return {
      token: typeof parsed?.token === 'string' ? parsed.token : '',
      token_field: parsed?.token_field === 'pending_oauth_token' ? 'pending_oauth_token' : 'pending_auth_token',
      provider,
      redirect: typeof parsed?.redirect === 'string' ? parsed.redirect : undefined,
      adoption_required: typeof parsed?.adoption_required === 'boolean' ? parsed.adoption_required : undefined,
      suggested_display_name:
        typeof parsed?.suggested_display_name === 'string' ? parsed.suggested_display_name : undefined,
      suggested_avatar_url: typeof parsed?.suggested_avatar_url === 'string' ? parsed.suggested_avatar_url : undefined,
    }
  } catch {
    localStorage.removeItem(PENDING_AUTH_SESSION_KEY)
    return null
  }
}

interface AuthState {
  user: User | null
  token: string | null
  refreshTokenValue: string | null
  tokenExpiresAt: number | null
  runMode: 'standard' | 'simple'
  pendingAuthSession: PendingAuthSessionSummary | null

  checkAuth: () => void
  login: (credentials: LoginRequest) => Promise<LoginResponse>
  login2FA: (tempToken: string, totpCode: string) => Promise<User>
  loginWithPasskey: (proof?: ActionCaptchaRequestProof) => Promise<User>
  register: (data: RegisterRequest) => Promise<User>
  setToken: (token: string) => Promise<User>
  logout: () => Promise<void>
  refreshUser: () => Promise<User>
  /** Replaces the cached user with a fresh copy returned by a profile API call. */
  setUser: (user: User) => void
  setPendingAuthSession: (session: PendingAuthSessionSummary | null) => void
  clearPendingAuthSession: () => void
}

let stopUserRefresh: (() => void) | null = null
let tokenRefreshTimeoutId: ReturnType<typeof setTimeout> | null = null

export const useAuthStore = create<AuthState>((set, get) => {
  function stopAutoRefresh() {
    stopUserRefresh?.()
    stopUserRefresh = null
  }

  function startAutoRefresh() {
    stopAutoRefresh()
    stopUserRefresh = pollWhileVisible(() => {
      if (get().token) {
        get()
          .refreshUser()
          .catch((error) => console.error('Auto-refresh user failed:', error))
      }
    }, AUTO_REFRESH_INTERVAL)
  }

  function stopTokenRefresh() {
    if (tokenRefreshTimeoutId) {
      clearTimeout(tokenRefreshTimeoutId)
      tokenRefreshTimeoutId = null
    }
  }

  async function performTokenRefresh() {
    if (!get().refreshTokenValue) return
    try {
      const response = await authAPI.refreshToken()
      set({ token: response.access_token, refreshTokenValue: response.refresh_token })
      scheduleTokenRefresh(response.expires_in)
    } catch (error) {
      // The axios interceptor handles 401s; keep local state here.
      console.error('Token refresh failed:', error)
    }
  }

  function scheduleTokenRefreshAt(expiresAtMs: number) {
    stopTokenRefresh()
    const refreshInMs = Math.max(0, expiresAtMs - Date.now() - TOKEN_REFRESH_BUFFER)
    if (refreshInMs <= 0) {
      void performTokenRefresh()
      return
    }
    tokenRefreshTimeoutId = setTimeout(() => void performTokenRefresh(), refreshInMs)
  }

  function scheduleTokenRefresh(expiresInSeconds: number) {
    const expiresAtMs = Date.now() + expiresInSeconds * 1000
    set({ tokenExpiresAt: expiresAtMs })
    localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(expiresAtMs))
    scheduleTokenRefreshAt(expiresAtMs)
  }

  function clearAuth(options?: { preservePendingAuthSession?: boolean }) {
    stopAutoRefresh()
    stopTokenRefresh()
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXPIRES_AT_KEY)
    if (options?.preservePendingAuthSession) {
      set({
        token: null,
        refreshTokenValue: null,
        tokenExpiresAt: null,
        user: null,
        pendingAuthSession: readPendingAuthSession(),
      })
      return
    }
    localStorage.removeItem(PENDING_AUTH_SESSION_KEY)
    set({ token: null, refreshTokenValue: null, tokenExpiresAt: null, user: null, pendingAuthSession: null })
  }

  function setPendingAuthSession(session: PendingAuthSessionSummary | null) {
    set({ pendingAuthSession: session })
    if (session) {
      localStorage.setItem(PENDING_AUTH_SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(PENDING_AUTH_SESSION_KEY)
    }
  }

  function preservePending() {
    return { preservePendingAuthSession: get().pendingAuthSession !== null }
  }

  function setAuthFromResponse(response: AuthResponse) {
    if (response.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token)
    }
    const { run_mode, ...userData } = response.user
    set({
      token: response.access_token,
      refreshTokenValue: response.refresh_token || get().refreshTokenValue,
      user: userData,
      ...(run_mode ? { runMode: run_mode } : {}),
    })
    localStorage.setItem(AUTH_TOKEN_KEY, response.access_token)
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData))
    setPendingAuthSession(null)
    startAutoRefresh()
    if (response.refresh_token && response.expires_in) {
      scheduleTokenRefresh(response.expires_in)
    }
  }

  return {
    user: null,
    token: null,
    refreshTokenValue: null,
    tokenExpiresAt: null,
    runMode: 'standard',
    pendingAuthSession: null,

    checkAuth() {
      const savedToken = localStorage.getItem(AUTH_TOKEN_KEY)
      const savedUser = localStorage.getItem(AUTH_USER_KEY)
      const savedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
      const savedExpiresAt = localStorage.getItem(TOKEN_EXPIRES_AT_KEY)
      set({ pendingAuthSession: readPendingAuthSession() })
      if (!savedToken || !savedUser) return
      try {
        const expiresAt = savedExpiresAt ? parseInt(savedExpiresAt, 10) : null
        set({
          token: savedToken,
          user: JSON.parse(savedUser) as User,
          refreshTokenValue: savedRefreshToken,
          tokenExpiresAt: expiresAt,
        })
        get()
          .refreshUser()
          .catch((error) => console.error('Failed to refresh user on init:', error))
        startAutoRefresh()
        if (savedRefreshToken && expiresAt !== null) {
          scheduleTokenRefreshAt(expiresAt)
        }
      } catch (error) {
        console.error('Failed to parse saved user data:', error)
        clearAuth({ preservePendingAuthSession: true })
      }
    },

    async login(credentials) {
      try {
        const response = await authAPI.login(credentials)
        if (isTotp2FARequired(response)) return response
        setAuthFromResponse(response)
        return response
      } catch (error) {
        clearAuth(preservePending())
        throw error
      }
    },

    async login2FA(tempToken, totpCode) {
      try {
        const response = await authAPI.login2FA({ temp_token: tempToken, totp_code: totpCode })
        setAuthFromResponse(response)
        return get().user!
      } catch (error) {
        clearAuth(preservePending())
        throw error
      }
    },

    async loginWithPasskey(proof) {
      try {
        const response = await passkeyAPI.login(proof)
        setAuthFromResponse(response)
        return get().user!
      } catch (error) {
        clearAuth(preservePending())
        throw error
      }
    },

    async register(data) {
      try {
        const response = await authAPI.register(data)
        setAuthFromResponse(response)
        return get().user!
      } catch (error) {
        clearAuth(preservePending())
        throw error
      }
    },

    async setToken(newToken) {
      stopAutoRefresh()
      stopTokenRefresh()
      localStorage.setItem(AUTH_TOKEN_KEY, newToken)
      const savedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
      const savedExpiresAt = localStorage.getItem(TOKEN_EXPIRES_AT_KEY)
      const expiresAt = savedExpiresAt ? parseInt(savedExpiresAt, 10) : null
      set({
        token: newToken,
        user: null,
        refreshTokenValue: savedRefreshToken ?? get().refreshTokenValue,
        tokenExpiresAt: expiresAt ?? get().tokenExpiresAt,
      })
      try {
        const userData = await get().refreshUser()
        startAutoRefresh()
        const exp = get().tokenExpiresAt
        if (savedRefreshToken && exp !== null) scheduleTokenRefreshAt(exp)
        setPendingAuthSession(null)
        return userData
      } catch (error) {
        clearAuth(preservePending())
        throw error
      }
    },

    async logout() {
      try {
        await authAPI.logout()
      } catch (err) {
        console.warn('Logout API call failed, clearing local session anyway', err)
      } finally {
        clearAuth()
      }
    },

    async refreshUser() {
      if (!get().token) throw new Error('Not authenticated')
      try {
        const response = await authAPI.getCurrentUser()
        const { run_mode, ...userData } = response.data
        set({ user: userData, ...(run_mode ? { runMode: run_mode } : {}) })
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData))
        return userData
      } catch (error) {
        if ((error as { status?: number }).status === 401) {
          clearAuth(preservePending())
        }
        throw error
      }
    },

    setUser(user) {
      set({ user })
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    },

    setPendingAuthSession,
    clearPendingAuthSession: () => setPendingAuthSession(null),
  }
})

export const selectIsAuthenticated = (s: AuthState) => !!s.token && !!s.user
export const selectIsAdmin = (s: AuthState) => s.user?.role === 'admin'
export const selectIsSimpleMode = (s: AuthState) => s.runMode === 'simple'

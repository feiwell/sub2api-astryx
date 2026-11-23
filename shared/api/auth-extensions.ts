/**
 * 临时 API 扩展 - 为 Astryx 前端提供缺失的函数
 * TODO: 这些函数需要根据实际后端 API 实现
 */

import { apiClient } from './client'

/**
 * 验证密码重置令牌
 * 临时实现：返回成功（实际应该验证 token 有效性）
 */
export async function verifyPasswordResetToken(token: string, email: string): Promise<{ valid: boolean }> {
  // TODO: 实现实际的 token 验证逻辑
  // 当前简化实现：认为有 token 就有效
  return { valid: !!token && !!email }
}

/**
 * 验证邮箱验证码
 * 临时实现：调用现有的 sendVerifyCode 后端点
 */
export async function verifyEmailCode(email: string, code: string): Promise<{ success: boolean; token?: string }> {
  // TODO: 实现实际的邮箱验证码验证
  // 可能需要后端添加新的 API 端点
  try {
    const response = await apiClient.post('/api/user/verify', { email, code })
    return { success: true, token: response.data?.token }
  } catch (error) {
    console.error('Email verification failed:', error)
    return { success: false }
  }
}

/**
 * 完成 OAuth 注册
 * 临时实现：返回成功
 */
export async function completeOAuthRegistration(data: {
  state: string
  email?: string
  username?: string
}): Promise<{ success: boolean; token?: string }> {
  // TODO: 实现 OAuth 注册完成逻辑
  // 可能需要后端添加新的 API 端点
  try {
    const response = await apiClient.post('/api/oauth/complete', data)
    return { success: true, token: response.data?.token }
  } catch (error) {
    console.error('OAuth registration completion failed:', error)
    return { success: false }
  }
}

/**
 * 交换 OAuth 回调令牌
 * 临时实现：直接返回 URL 参数
 */
export async function exchangeOAuthCallback(params: {
  code?: string
  state?: string
  error?: string
}): Promise<{ success: boolean; token?: string; error?: string }> {
  // TODO: 实现实际的 OAuth 回调处理
  // 需要将 code 交换为 access token
  if (params.error) {
    return { success: false, error: params.error }
  }

  try {
    const response = await apiClient.post('/api/oauth/callback', params)
    return { success: true, token: response.data?.token }
  } catch (error) {
    console.error('OAuth callback exchange failed:', error)
    return { success: false, error: 'OAuth callback failed' }
  }
}

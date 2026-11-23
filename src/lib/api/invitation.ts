/**
 * Invitation API endpoints
 * Handles invitation code validation and usage
 */

import { apiClient } from './client'

/**
 * Invitation code validation request
 */
export interface ValidateInvitationCodeRequest {
  code: string
}

/**
 * Invitation code validation response
 */
export interface ValidateInvitationCodeResponse {
  valid: boolean
  message?: string
}

/**
 * Validate invitation code
 * @param code - Invitation code to validate
 * @returns Validation result
 */
export async function validateInvitationCode(code: string): Promise<ValidateInvitationCodeResponse> {
  try {
    const { data } = await apiClient.post<ValidateInvitationCodeResponse>('/auth/validate-invitation-code', {
      code,
    })
    return data
  } catch (error) {
    // If API call fails, return invalid
    return { valid: false, message: 'Failed to validate invitation code' }
  }
}

/**
 * Use invitation code during registration
 * @param code - Invitation code to use
 * @returns Success response
 */
export async function useInvitationCode(code: string): Promise<{ success: boolean; message?: string }> {
  try {
    const { data } = await apiClient.post('/auth/use-invitation-code', { code })
    return data
  } catch (error) {
    return { success: false, message: 'Failed to use invitation code' }
  }
}

/**
 * Check if invitation code is required for registration
 * @returns Whether invitation code is required
 */
export async function isInvitationCodeRequired(): Promise<boolean> {
  try {
    const { data } = await apiClient.get<{ required: boolean }>('/auth/invitation-required')
    return data.required
  } catch {
    return false
  }
}

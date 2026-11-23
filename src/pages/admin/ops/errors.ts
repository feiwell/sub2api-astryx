/** The API client rejects with `{ status, code, message }`; other errors may carry neither field. */
export const errorCode = (error: unknown): unknown =>
  error && typeof error === 'object' && 'code' in error ? error.code : undefined

export const errorMessage = (error: unknown): string =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : ''

import type { AppData, UserRole } from '../types'
import { getTelegramInitData } from './telegram'

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: UserRole
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const telegramInitData = getTelegramInitData()
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(telegramInitData ? { 'X-Telegram-Init-Data': telegramInitData } : {}),
      ...(options.headers || {}),
    },
    ...options,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || 'Ошибка запроса') as Error & { status?: number; details?: string }
    error.status = response.status
    error.details = payload.details
    throw error
  }
  return payload as T
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST', body: '{}' }),
  me: () => request<{ user: AuthUser }>('/api/auth/me'),
  getData: () => request<{ data: AppData }>('/api/data'),
  saveData: (data: Partial<AppData>) =>
    request<{ data: AppData; savedAt: string }>('/api/data', {
      method: 'PATCH',
      body: JSON.stringify({ data }),
    }),
  resetData: () => request<{ data: AppData }>('/api/data/reset', { method: 'POST', body: '{}' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/api/account/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  generateMarketing: (prompt: string, context: unknown) =>
    request<{ summary: string; items: unknown[] }>('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ prompt, context }),
    }),
}

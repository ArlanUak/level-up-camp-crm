type TelegramThemeParams = Record<string, string | undefined>

export interface TelegramWebAppUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe?: { user?: TelegramWebAppUser }
  colorScheme?: 'light' | 'dark'
  themeParams?: TelegramThemeParams
  ready: () => void
  expand: () => void
  close: () => void
  MainButton?: {
    hide: () => void
  }
  BackButton?: {
    hide: () => void
  }
  disableVerticalSwipes?: () => void
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp ?? null
}

export function getTelegramInitData() {
  return getTelegramWebApp()?.initData || ''
}

export function isTelegramMiniApp() {
  return Boolean(getTelegramInitData())
}

export function getTelegramUser() {
  return getTelegramWebApp()?.initDataUnsafe?.user ?? null
}

export function setupTelegramMiniApp() {
  const tg = getTelegramWebApp()
  if (!tg) return

  tg.ready()
  tg.expand()
  tg.MainButton?.hide()
  tg.BackButton?.hide()
  tg.disableVerticalSwipes?.()

  const root = document.documentElement
  const theme = tg.themeParams || {}
  root.dataset.telegram = 'true'
  root.dataset.telegramScheme = tg.colorScheme || 'light'

  if (theme.bg_color) root.style.setProperty('--tg-bg', theme.bg_color)
  if (theme.text_color) root.style.setProperty('--tg-text', theme.text_color)
  if (theme.hint_color) root.style.setProperty('--tg-muted', theme.hint_color)
  if (theme.button_color) root.style.setProperty('--tg-primary', theme.button_color)
}

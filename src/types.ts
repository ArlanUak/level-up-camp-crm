export type UserRole = 'admin' | 'teacher' | 'smm'

export type StudentStatus = 'Ожидает начала' | 'Обучается' | 'Завершил' | 'Отменил участие'
export type PaymentStatus = 'Оплачено' | 'Частично' | 'Не оплачено'
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'
export type ContentStatus = 'Идея' | 'Нужно снять' | 'Монтаж' | 'Готово' | 'Опубликовано'

export interface Student {
  id: string
  fullName: string
  age: number
  parentName: string
  parentPhone: string
  streamId: string
  status: StudentStatus
  price: number
  paid: number
  photoConsent: boolean
  notes: string
  createdAt: string
}

export interface CampStream {
  id: string
  name: string
  startDate: string
  endDate: string
  time: string
  teacher: string
  capacity: number
  status: 'Набор' | 'Скоро начнётся' | 'Идёт' | 'Завершён' | 'Архив'
  program: string[]
}

export interface JournalEntry {
  id: string
  studentId: string
  streamId: string
  date: string
  attendance: AttendanceStatus
  grade: number | null
  xp: number
  comment: string
}

export interface FinanceTransaction {
  id: string
  date: string
  type: 'income' | 'expense'
  category: string
  amount: number
  streamId?: string
  studentId?: string
  comment: string
}

export interface ContentItem {
  id: string
  date: string
  platform: 'Instagram' | 'TikTok' | 'Threads' | 'Stories'
  format: string
  rubric: string
  topic: string
  goal: string
  status: ContentStatus
  hook: string
  script: string
  shots: string[]
  cta: string
  views?: number
  leads?: number
}

export interface MarketingTask {
  id: string
  title: string
  dueDate: string
  priority: 'Низкий' | 'Средний' | 'Высокий'
  status: 'Запланировано' | 'В работе' | 'На согласовании' | 'Готово'
}

export interface AppData {
  students: Student[]
  streams: CampStream[]
  journal: JournalEntry[]
  transactions: FinanceTransaction[]
  content: ContentItem[]
  marketingTasks: MarketingTask[]
}

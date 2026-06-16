import writeExcelFile from 'write-excel-file/browser'
import type { AppData, CampStream, Student } from '../types'

const header = (value: string) => ({
  value,
  fontWeight: 'bold' as const,
  backgroundColor: '#E8EEFF',
  align: 'center' as const,
  wrap: true,
})

const money = (value: number) => ({
  value,
  type: Number,
  format: '#,##0 "₸"',
})

function streamName(streams: CampStream[], id?: string) {
  return streams.find((stream) => stream.id === id)?.name ?? '—'
}

function studentName(students: Student[], id?: string) {
  return students.find((student) => student.id === id)?.fullName ?? '—'
}

export async function exportStudentsWorkbook(data: AppData) {
  const studentsData = [
    ['Ребёнок', 'Возраст', 'Родитель', 'Телефон', 'Поток', 'Статус', 'Стоимость', 'Оплачено', 'Остаток', 'Фото/видео'],
    ...data.students.map((student) => [
      student.fullName,
      student.age,
      student.parentName,
      student.parentPhone,
      streamName(data.streams, student.streamId),
      student.status,
      money(student.price),
      money(student.paid),
      money(Math.max(student.price - student.paid, 0)),
      student.photoConsent ? 'Да' : 'Нет',
    ]),
  ].map((row, index) => index === 0 ? row.map((cell) => header(String(cell))) : row)

  const journalData = [
    ['Дата', 'Поток', 'Ребёнок', 'Посещение', 'Оценка', 'XP', 'Комментарий'],
    ...data.journal.map((entry) => [
      entry.date,
      streamName(data.streams, entry.streamId),
      studentName(data.students, entry.studentId),
      ({ present: 'Присутствовал', late: 'Опоздал', absent: 'Отсутствовал', excused: 'Уважительная причина' })[entry.attendance],
      entry.grade ?? '—',
      entry.xp,
      entry.comment,
    ]),
  ].map((row, index) => index === 0 ? row.map((cell) => header(String(cell))) : row)

  await writeExcelFile([
    { data: studentsData, sheet: 'Дети', columns: [{ width: 24 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 27 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }], stickyRowsCount: 1 },
    { data: journalData, sheet: 'Журнал', columns: [{ width: 14 }, { width: 27 }, { width: 24 }, { width: 18 }, { width: 10 }, { width: 10 }, { width: 38 }], stickyRowsCount: 1 },
  ]).toFile('Level-Up-дети-и-журнал.xlsx')
}

export async function exportFinanceWorkbook(data: AppData) {
  const sheet = [
    ['Дата', 'Тип', 'Категория', 'Сумма', 'Поток', 'Ребёнок', 'Комментарий'],
    ...data.transactions.map((item) => [
      item.date,
      item.type === 'income' ? 'Доход' : 'Расход',
      item.category,
      money(item.amount),
      streamName(data.streams, item.streamId),
      studentName(data.students, item.studentId),
      item.comment,
    ]),
  ].map((row, index) => index === 0 ? row.map((cell) => header(String(cell))) : row)

  await writeExcelFile(sheet, {
    sheet: 'Финансы',
    columns: [{ width: 14 }, { width: 12 }, { width: 20 }, { width: 15 }, { width: 28 }, { width: 24 }, { width: 36 }],
    stickyRowsCount: 1,
  }).toFile('Level-Up-финансы.xlsx')
}

export async function exportMarketingWorkbook(data: AppData) {
  const plan = [
    ['Дата', 'Площадка', 'Формат', 'Рубрика', 'Тема', 'Цель', 'Статус', 'Хук', 'Сценарий', 'CTA', 'Просмотры', 'Лиды'],
    ...data.content.map((item) => [
      item.date,
      item.platform,
      item.format,
      item.rubric,
      item.topic,
      item.goal,
      item.status,
      item.hook,
      item.script,
      item.cta,
      item.views ?? 0,
      item.leads ?? 0,
    ]),
  ].map((row, index) => index === 0 ? row.map((cell) => header(String(cell))) : row)

  const tasks = [
    ['Задача', 'Дедлайн', 'Приоритет', 'Статус'],
    ...data.marketingTasks.map((task) => [task.title, task.dueDate, task.priority, task.status]),
  ].map((row, index) => index === 0 ? row.map((cell) => header(String(cell))) : row)

  await writeExcelFile([
    { data: plan, sheet: 'Контент-план', columns: [{ width: 14 }, { width: 14 }, { width: 18 }, { width: 16 }, { width: 36 }, { width: 24 }, { width: 16 }, { width: 42 }, { width: 55 }, { width: 30 }, { width: 12 }, { width: 10 }], stickyRowsCount: 1 },
    { data: tasks, sheet: 'Задачи', columns: [{ width: 42 }, { width: 14 }, { width: 14 }, { width: 20 }], stickyRowsCount: 1 },
  ]).toFile('Level-Up-маркетинг.xlsx')
}

import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  Banknote,
  BarChart3,
  BookOpenCheck,
  Bot,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PenLine,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
  X,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'
import type {
  AppData,
  AttendanceStatus,
  CampStream,
  ContentItem,
  ContentStatus,
  FinanceTransaction,
  JournalEntry,
  MarketingTask,
  Student,
  StudentStatus,
  UserRole,
} from './types'
import { exportFinanceWorkbook, exportMarketingWorkbook, exportStudentsWorkbook } from './lib/excel'
import { Badge, Button, EmptyState, Field, Modal, ProgressBar, SectionHeader, StatCard } from './components/ui'
import { cn } from './lib/cn'
import { api, type AuthUser } from './lib/api'
import { initialData } from './mockData'

type ViewId = 'dashboard' | 'students' | 'streams' | 'journal' | 'finance' | 'marketing' | 'tasks' | 'ai' | 'settings'

type NavItem = {
  id: ViewId
  label: string
  icon: typeof LayoutDashboard
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Администратор',
  teacher: 'Преподаватель',
  smm: 'SMM-специалист',
}

const navigation: Record<UserRole, NavItem[]> = {
  admin: [
    { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
    { id: 'students', label: 'Дети', icon: Users },
    { id: 'streams', label: 'Потоки', icon: CalendarDays },
    { id: 'journal', label: 'Журнал', icon: ClipboardCheck },
    { id: 'finance', label: 'Финансы', icon: WalletCards },
    { id: 'marketing', label: 'Маркетинг', icon: Target },
    { id: 'ai', label: 'AI-ассистент', icon: Sparkles },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ],
  teacher: [
    { id: 'dashboard', label: 'Сегодня', icon: LayoutDashboard },
    { id: 'streams', label: 'Мои потоки', icon: CalendarDays },
    { id: 'journal', label: 'Журнал', icon: ClipboardCheck },
    { id: 'students', label: 'Дети', icon: Users },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ],
  smm: [
    { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
    { id: 'marketing', label: 'Контент-план', icon: CalendarDays },
    { id: 'tasks', label: 'Задачи', icon: ListTodo },
    { id: 'ai', label: 'AI-ассистент', icon: Sparkles },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ],
}

const formatMoney = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₸`
const formatDate = (value: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${value}T00:00:00`))
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function paymentStatus(student: Student) {
  if (student.paid >= student.price) return 'Оплачено'
  if (student.paid > 0) return 'Частично'
  return 'Не оплачено'
}

function paymentTone(student: Student): 'green' | 'amber' | 'red' {
  if (student.paid >= student.price) return 'green'
  if (student.paid > 0) return 'amber'
  return 'red'
}

function statusTone(status: string): 'neutral' | 'green' | 'red' | 'amber' | 'blue' | 'purple' {
  if (['Оплачено', 'Обучается', 'Идёт', 'Готово', 'Опубликовано', 'Присутствовал'].includes(status)) return 'green'
  if (['Частично', 'Скоро начнётся', 'Монтаж', 'В работе', 'Опоздал'].includes(status)) return 'amber'
  if (['Не оплачено', 'Отменил участие', 'Отсутствовал'].includes(status)) return 'red'
  if (['Набор', 'Нужно снять', 'Ожидает начала', 'Запланировано'].includes(status)) return 'blue'
  if (['Идея', 'На согласовании'].includes(status)) return 'purple'
  return 'neutral'
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [data, setData] = useState<AppData>(initialData)
  const [booting, setBooting] = useState(true)
  const [activeView, setActiveView] = useState<ViewId>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [saveError, setSaveError] = useState('')
  const saveTimer = useRef<number | null>(null)
  const pendingPatch = useRef<Partial<AppData>>({})
  const saving = useRef(false)

  useEffect(() => {
    const boot = async () => {
      try {
        const auth = await api.me()
        const response = await api.getData()
        setUser(auth.user)
        setData(response.data)
      } catch {
        setUser(null)
      } finally {
        setBooting(false)
      }
    }
    void boot()
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [])

  const loadAccount = async (nextUser: AuthUser) => {
    const response = await api.getData()
    setUser(nextUser)
    setData(response.data)
    setActiveView('dashboard')
    setSaveStatus('saved')
    setSaveError('')
  }

  const flushSave = async () => {
    if (saving.current || !Object.keys(pendingPatch.current).length) return
    const patch = { ...pendingPatch.current }
    let failed = false
    saving.current = true
    try {
      const response = await api.saveData(patch)
      for (const key of Object.keys(patch) as (keyof AppData)[]) {
        if (pendingPatch.current[key] === patch[key]) delete pendingPatch.current[key]
      }
      if (!Object.keys(pendingPatch.current).length) {
        setData(response.data)
        setSaveStatus('saved')
      }
    } catch (error) {
      failed = true
      setSaveStatus('error')
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить изменения')
    } finally {
      saving.current = false
      if (Object.keys(pendingPatch.current).length && !failed) {
        window.setTimeout(() => void flushSave(), 150)
      }
    }
  }

  const scheduleSave = (current: AppData, next: AppData) => {
    const changed: Partial<AppData> = {}
    if (current.students !== next.students) changed.students = next.students
    if (current.streams !== next.streams) changed.streams = next.streams
    if (current.journal !== next.journal) changed.journal = next.journal
    if (current.transactions !== next.transactions) changed.transactions = next.transactions
    if (current.content !== next.content) changed.content = next.content
    if (current.marketingTasks !== next.marketingTasks) changed.marketingTasks = next.marketingTasks
    Object.assign(pendingPatch.current, changed)
    setSaveStatus('saving')
    setSaveError('')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void flushSave(), 500)
  }

  const updateData = (updater: (current: AppData) => AppData) => {
    setData((current) => {
      const next = updater(current)
      scheduleSave(current, next)
      return next
    })
  }

  const logout = async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
      setData(initialData)
      setActiveView('dashboard')
    }
  }

  if (booting) {
    return <div className="app-loading"><div className="brand__mark"><Zap size={24} fill="currentColor" /></div><LoaderCircle className="spin" size={28} /><strong>Запускаем Level Up Camp OS</strong></div>
  }

  if (!user) return <LoginPage onLogin={loadAccount} />

  const role = user.role

  const page = (() => {
    switch (activeView) {
      case 'students':
        return <StudentsPage data={data} role={role} updateData={updateData} />
      case 'streams':
        return <StreamsPage data={data} role={role} updateData={updateData} />
      case 'journal':
        return <JournalPage data={data} updateData={updateData} />
      case 'finance':
        return <FinancePage data={data} updateData={updateData} />
      case 'marketing':
        return <MarketingPage data={data} updateData={updateData} />
      case 'tasks':
        return <TasksPage data={data} updateData={updateData} />
      case 'ai':
        return <AiPage data={data} updateData={updateData} />
      case 'settings':
        return <SettingsPage data={data} user={user} onReset={async () => { const response = await api.resetData(); setData(response.data) }} />
      default:
        return <DashboardPage data={data} role={role} goTo={setActiveView} />
    }
  })()

  const currentItem = navigation[role].find((item) => item.id === activeView)
  const mobileItems = navigation[role].slice(0, 4)
  const initials = user.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="app-shell">
      <aside className={cn('sidebar', sidebarOpen && 'sidebar--open')}>
        <div className="brand">
          <div className="brand__mark"><Zap size={22} fill="currentColor" /></div>
          <div>
            <strong>Level Up</strong>
            <span>Camp OS</span>
          </div>
        </div>

        <div className="role-card">
          <div className="avatar avatar--soft">{initials}</div>
          <div><strong>{user.displayName}</strong><span>{roleLabels[role]}</span></div>
        </div>

        <nav className="sidebar__nav">
          {navigation[role].map(({ id, label, icon: Icon }) => (
            <button key={id} className={cn('nav-item', activeView === id && 'nav-item--active')} onClick={() => { setActiveView(id); setSidebarOpen(false) }}>
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar__footer">
          <button className="logout-button" onClick={() => void logout()}><LogOut size={18} /><span>Выйти</span></button>
        </div>
      </aside>

      {sidebarOpen && <button aria-label="Закрыть меню" className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setSidebarOpen(true)} aria-label="Открыть меню"><Menu size={21} /></button>
          <div className="topbar__title">
            <span>{currentItem?.label ?? 'Level Up Camp'}</span>
            <small>{roleLabels[role]}</small>
          </div>
          <div className="topbar__actions">
            <div className={cn('save-pill', saveStatus === 'error' && 'save-pill--error')} title={saveError}>
              {saveStatus === 'saving' ? <LoaderCircle className="spin" size={14} /> : <span />}
              {saveStatus === 'saving' ? 'Сохраняю…' : saveStatus === 'error' ? 'Ошибка сохранения' : 'Данные сохранены'}
            </div>
            <div className="avatar avatar--small">{initials}</div>
          </div>
        </header>

        <main className="content">{page}</main>
      </div>

      <nav className="mobile-bottom-nav">
        {mobileItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={cn(activeView === id && 'active')} onClick={() => setActiveView(id)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
        {navigation[role].length > 4 && (
          <button className={cn(!mobileItems.some((item) => item.id === activeView) && 'active')} onClick={() => setSidebarOpen(true)}>
            <MoreHorizontal size={20} />
            <span>Ещё</span>
          </button>
        )}
      </nav>
    </div>
  )
}

function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => Promise<void> }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await api.login(username, password)
      await onLogin(response.user)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось войти')
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-page">
    <div className="login-visual">
      <div className="login-visual__content">
        <div className="brand brand--login"><div className="brand__mark"><Zap size={24} fill="currentColor" /></div><div><strong>Level Up</strong><span>Camp OS</span></div></div>
        <h1>Весь лагерь<br />в одной системе</h1>
        <p>Дети, потоки, журнал, финансы, контент-план и Gemini — без отдельной настройки базы данных.</p>
        <div className="login-features"><span><Check size={17} /> Общая база для команды</span><span><Check size={17} /> Адаптивно для телефона</span><span><Check size={17} /> Excel-выгрузки</span></div>
      </div>
    </div>
    <div className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div><span className="eyebrow">Вход в систему</span><h2>С возвращением</h2><p>Введите свои данные для входа.</p></div>
        <Field label="Логин"><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></Field>
        <Field label="Пароль"><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></Field>
        {error && <div className="login-error">{error}</div>}
        <Button type="submit" disabled={loading} icon={loading ? <LoaderCircle className="spin" size={17} /> : <UserRound size={17} />}>{loading ? 'Вхожу…' : 'Войти'}</Button>
        <small className="login-hint">После первого входа поменяй пароли в настройках.</small>
      </form>
    </div>
  </div>
}

function DashboardPage({ data, role, goTo }: { data: AppData; role: UserRole; goTo: (view: ViewId) => void }) {
  if (role === 'teacher') return <TeacherDashboard data={data} goTo={goTo} />
  if (role === 'smm') return <SmmDashboard data={data} goTo={goTo} />
  return <AdminDashboard data={data} goTo={goTo} />
}

function AdminDashboard({ data, goTo }: { data: AppData; goTo: (view: ViewId) => void }) {
  const income = data.transactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)
  const expense = data.transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
  const debt = data.students.reduce((sum, student) => sum + Math.max(student.price - student.paid, 0), 0)
  const activeStudents = data.students.filter((student) => ['Обучается', 'Ожидает начала'].includes(student.status)).length
  const financeChart = [
    { name: 'Янв', income: 120, expense: 55 },
    { name: 'Фев', income: 180, expense: 80 },
    { name: 'Мар', income: 165, expense: 72 },
    { name: 'Апр', income: 245, expense: 120 },
    { name: 'Май', income: 310, expense: 145 },
    { name: 'Июн', income: income / 1000, expense: expense / 1000 },
  ]

  return (
    <>
      <SectionHeader
        title="Добрый день, Арлан 👋"
        description="Вот что происходит в Level Up IT Camp сегодня."
        actions={<Button icon={<Plus size={17} />} onClick={() => goTo('students')}>Добавить ребёнка</Button>}
      />
      <div className="stats-grid">
        <StatCard label="Детей в системе" value={String(activeStudents)} helper="в активных потоках" icon={<Users size={21} />} />
        <StatCard label="Получено оплат" value={formatMoney(income)} helper={`Ожидается ${formatMoney(debt)}`} icon={<CircleDollarSign size={21} />} accent="green" />
        <StatCard label="Расходы" value={formatMoney(expense)} helper="за текущий период" icon={<ReceiptText size={21} />} accent="orange" />
        <StatCard label="Чистая прибыль" value={formatMoney(income - expense)} helper="по внесённым операциям" icon={<TrendingUp size={21} />} accent="purple" />
      </div>

      <div className="dashboard-grid dashboard-grid--wide">
        <section className="panel chart-panel">
          <div className="panel__header">
            <div><h2>Финансы</h2><p>Доходы и расходы, тыс. ₸</p></div>
            <Button variant="ghost" size="sm" onClick={() => goTo('finance')}>Подробнее</Button>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financeChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5B7CFA" stopOpacity={0.3}/><stop offset="95%" stopColor="#5B7CFA" stopOpacity={0}/></linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2}/><stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EBF2" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} />
                <Tooltip formatter={(value) => `${value} тыс. ₸`} contentStyle={{ borderRadius: 12, border: '1px solid #e6e8ef' }} />
                <Area type="monotone" dataKey="income" stroke="#5B7CFA" strokeWidth={2.5} fill="url(#incomeFill)" name="Доход" />
                <Area type="monotone" dataKey="expense" stroke="#F59E0B" strokeWidth={2} fill="url(#expenseFill)" name="Расход" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header"><div><h2>Ближайший поток</h2><p>15–19 июня · 09:00–13:00</p></div><Badge tone="blue">Скоро</Badge></div>
          <div className="stream-summary">
            <div className="stream-summary__hero"><div className="stream-summary__icon"><GraduationCap /></div><div><strong>IT Camp · 5 дней</strong><span>Арлан · Күлтегін 21</span></div></div>
            <div className="capacity-row"><span>Заполнено мест</span><strong>{data.students.filter((student) => student.streamId === 'stream-1').length} / 10</strong></div>
            <ProgressBar value={data.students.filter((student) => student.streamId === 'stream-1').length} max={10} />
            <div className="mini-list">
              <div><Check size={16} /><span>Программа и преподаватель назначены</span></div>
              <div><Check size={16} /><span>Журнал готов к заполнению</span></div>
              <div><Activity size={16} /><span>Контент на первый день в плане</span></div>
            </div>
            <Button variant="secondary" onClick={() => goTo('streams')}>Открыть поток</Button>
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel__header"><div><h2>Последние дети</h2><p>Недавно добавленные записи</p></div><Button variant="ghost" size="sm" onClick={() => goTo('students')}>Все дети</Button></div>
          <div className="people-list">
            {data.students.slice(-4).reverse().map((student) => (
              <div className="person-row" key={student.id}>
                <div className="avatar avatar--soft">{student.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
                <div className="person-row__main"><strong>{student.fullName}</strong><span>{student.age} лет · {data.streams.find((stream) => stream.id === student.streamId)?.name}</span></div>
                <Badge tone={paymentTone(student)}>{paymentStatus(student)}</Badge>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel__header"><div><h2>Маркетинг</h2><p>План на ближайшие дни</p></div><Button variant="ghost" size="sm" onClick={() => goTo('marketing')}>Открыть</Button></div>
          <div className="timeline-list">
            {data.content.slice(0, 3).map((item) => (
              <div key={item.id} className="timeline-item">
                <div className="timeline-item__date"><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(`${item.date}T00:00:00`))}</span></div>
                <div className="timeline-item__content"><strong>{item.topic}</strong><span>{item.platform} · {item.format}</span></div>
                <Badge tone={statusTone(item.status)}>{item.status}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

function TeacherDashboard({ data, goTo }: { data: AppData; goTo: (view: ViewId) => void }) {
  const stream = data.streams[0]
  const streamStudents = data.students.filter((student) => student.streamId === stream.id)
  const entries = data.journal.filter((entry) => entry.streamId === stream.id && entry.date === stream.startDate)
  const filled = new Set(entries.map((entry) => entry.studentId)).size
  const present = entries.filter((entry) => entry.attendance === 'present').length

  return (
    <>
      <SectionHeader title="Сегодняшнее занятие" description="Всё необходимое для работы с группой на одном экране." actions={<Button icon={<ClipboardCheck size={17} />} onClick={() => goTo('journal')}>Открыть журнал</Button>} />
      <section className="teacher-hero">
        <div>
          <Badge tone="blue">День 1 из 5</Badge>
          <h2>Сайт на HTML и CSS</h2>
          <p>{stream.name} · {stream.time}</p>
          <div className="teacher-hero__meta"><span><Users size={17} /> {streamStudents.length} детей</span><span><BookOpenCheck size={17} /> Практический проект</span></div>
        </div>
        <div className="teacher-progress-ring"><strong>{filled}/{streamStudents.length}</strong><span>журнал<br/>заполнен</span></div>
      </section>
      <div className="stats-grid stats-grid--three">
        <StatCard label="В группе" value={String(streamStudents.length)} helper="учеников" icon={<Users size={21} />} />
        <StatCard label="Присутствуют" value={String(present)} helper="по журналу" icon={<ClipboardCheck size={21} />} accent="green" />
        <StatCard label="Средний XP" value={String(entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.xp, 0) / entries.length) : 0)} helper="за занятие" icon={<Zap size={21} />} accent="purple" />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel__header"><div><h2>Дети группы</h2><p>Быстрый просмотр статуса</p></div><Button variant="ghost" size="sm" onClick={() => goTo('students')}>Открыть</Button></div>
          <div className="people-list">
            {streamStudents.map((student) => {
              const entry = entries.find((item) => item.studentId === student.id)
              const label = !entry ? 'Не заполнено' : entry.attendance === 'present' ? 'Присутствовал' : entry.attendance === 'late' ? 'Опоздал' : entry.attendance === 'absent' ? 'Отсутствовал' : 'Уважительная причина'
              return <div className="person-row" key={student.id}><div className="avatar avatar--soft">{student.fullName.slice(0, 1)}</div><div className="person-row__main"><strong>{student.fullName}</strong><span>{entry ? `${entry.xp} XP · оценка ${entry.grade ?? '—'}` : 'Запись ещё не создана'}</span></div><Badge tone={statusTone(label)}>{label}</Badge></div>
            })}
          </div>
        </section>
        <section className="panel lesson-plan">
          <div className="panel__header"><div><h2>План занятия</h2><p>Сегодня · 4 часа</p></div></div>
          {['Знакомство и вводная теория', 'Собираем структуру сайта', 'Перерыв и командная игра', 'Верстаем первый экран', 'Улучшаем проект с AI'].map((item, index) => <div className="lesson-step" key={item}><span>{index + 1}</span><div><strong>{item}</strong><small>{index === 0 ? '30 минут' : index === 2 ? '20 минут' : '50–60 минут'}</small></div></div>)}
        </section>
      </div>
    </>
  )
}

function SmmDashboard({ data, goTo }: { data: AppData; goTo: (view: ViewId) => void }) {
  const published = data.content.filter((item) => item.status === 'Опубликовано')
  const views = data.content.reduce((sum, item) => sum + (item.views ?? 0), 0)
  const leads = data.content.reduce((sum, item) => sum + (item.leads ?? 0), 0)
  const chartData = data.content.map((item) => ({ name: formatDate(item.date), views: item.views ?? 0, leads: item.leads ?? 0 }))

  return (
    <>
      <SectionHeader title="Маркетинг Level Up" description="Контент, задачи и результаты без доступа к данным детей." actions={<Button icon={<Sparkles size={17} />} onClick={() => goTo('ai')}>Создать с AI</Button>} />
      <div className="stats-grid">
        <StatCard label="Контент в плане" value={String(data.content.length)} helper="публикации" icon={<CalendarDays size={21} />} />
        <StatCard label="Нужно снять" value={String(data.content.filter((item) => item.status === 'Нужно снять').length)} helper="на ближайшие дни" icon={<PenLine size={21} />} accent="orange" />
        <StatCard label="Просмотры" value={new Intl.NumberFormat('ru-RU').format(views)} helper={`${published.length} опубликовано`} icon={<BarChart3 size={21} />} accent="purple" />
        <StatCard label="Лиды" value={String(leads)} helper="из отмеченного контента" icon={<Target size={21} />} accent="green" />
      </div>
      <div className="dashboard-grid dashboard-grid--wide">
        <section className="panel chart-panel">
          <div className="panel__header"><div><h2>Результаты контента</h2><p>Просмотры по публикациям</p></div></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EBF2" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6e8ef' }} />
                <Bar dataKey="views" fill="#6C63FF" radius={[6, 6, 0, 0]} name="Просмотры" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <div className="panel__header"><div><h2>Задачи</h2><p>Ближайшие дедлайны</p></div><Button variant="ghost" size="sm" onClick={() => goTo('tasks')}>Все задачи</Button></div>
          <div className="task-compact-list">
            {data.marketingTasks.slice(0, 4).map((task) => <div key={task.id} className="task-compact"><span className={`priority-dot priority-dot--${task.priority.toLowerCase()}`} /><div><strong>{task.title}</strong><small>до {formatDate(task.dueDate)}</small></div><Badge tone={statusTone(task.status)}>{task.status}</Badge></div>)}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel__header"><div><h2>Ближайший контент</h2><p>Что нужно подготовить</p></div><Button variant="ghost" size="sm" onClick={() => goTo('marketing')}>Открыть план</Button></div>
        <div className="content-cards-grid">
          {data.content.slice(0, 3).map((item) => <article className="content-mini-card" key={item.id}><div><Badge tone={statusTone(item.status)}>{item.status}</Badge><span>{formatDate(item.date)}</span></div><h3>{item.topic}</h3><p>{item.platform} · {item.format}</p><div className="content-mini-card__goal"><Target size={15} /> {item.goal}</div></article>)}
        </div>
      </section>
    </>
  )
}

function StudentsPage({ data, role, updateData }: { data: AppData; role: UserRole; updateData: (fn: (data: AppData) => AppData) => void }) {
  const [search, setSearch] = useState('')
  const [streamFilter, setStreamFilter] = useState('all')
  const [selected, setSelected] = useState<Student | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const visibleStudents = data.students.filter((student) => {
    const matchesSearch = `${student.fullName} ${student.parentName} ${student.parentPhone}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (streamFilter === 'all' || student.streamId === streamFilter)
  })

  const addStudent = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const price = Number(form.get('price')) || 0
    const paid = Number(form.get('paid')) || 0
    const student: Student = {
      id: uid('student'),
      fullName: String(form.get('fullName') || ''),
      age: Number(form.get('age')) || 0,
      parentName: String(form.get('parentName') || ''),
      parentPhone: String(form.get('parentPhone') || ''),
      streamId: String(form.get('streamId') || data.streams[0]?.id || ''),
      status: String(form.get('status') || 'Ожидает начала') as StudentStatus,
      price,
      paid,
      photoConsent: form.get('photoConsent') === 'on',
      notes: String(form.get('notes') || ''),
      createdAt: new Date().toISOString().slice(0, 10),
    }
    updateData((current) => ({
      ...current,
      students: [...current.students, student],
      transactions: paid > 0 ? [...current.transactions, { id: uid('finance'), date: new Date().toISOString().slice(0, 10), type: 'income', category: 'Оплата лагеря', amount: paid, streamId: student.streamId, studentId: student.id, comment: 'Оплата при добавлении ребёнка' }] : current.transactions,
    }))
    setAddOpen(false)
  }

  return (
    <>
      <SectionHeader
        title="Дети"
        description={`${visibleStudents.length} записей · учёт, контакты и прогресс`}
        actions={<>{role === 'admin' && <Button variant="secondary" icon={<FileSpreadsheet size={17} />} onClick={() => exportStudentsWorkbook(data)}>Скачать Excel</Button>}{role === 'admin' && <Button icon={<Plus size={17} />} onClick={() => setAddOpen(true)}>Добавить ребёнка</Button>}</>}
      />
      <div className="toolbar">
        <label className="search-box"><Search size={18} /><input placeholder="Найти ребёнка или родителя" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select className="filter-select" value={streamFilter} onChange={(event) => setStreamFilter(event.target.value)}><option value="all">Все потоки</option>{data.streams.map((stream) => <option value={stream.id} key={stream.id}>{stream.name}</option>)}</select>
      </div>

      <section className="panel table-panel desktop-table-wrap">
        <table className="data-table">
          <thead><tr><th>Ребёнок</th><th>Поток</th><th>Родитель</th>{role === 'admin' && <th>Оплата</th>}<th>Статус</th><th /></tr></thead>
          <tbody>{visibleStudents.map((student) => <tr key={student.id}>
            <td><div className="table-person"><div className="avatar avatar--soft">{student.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div><strong>{student.fullName}</strong><span>{student.age} лет</span></div></div></td>
            <td><strong className="muted-strong">{data.streams.find((stream) => stream.id === student.streamId)?.name ?? 'Без потока'}</strong></td>
            <td><div className="stacked-cell"><strong>{student.parentName}</strong><span>{student.parentPhone}</span></div></td>
            {role === 'admin' && <td><div className="stacked-cell"><Badge tone={paymentTone(student)}>{paymentStatus(student)}</Badge><span>{formatMoney(student.paid)} из {formatMoney(student.price)}</span></div></td>}
            <td><Badge tone={statusTone(student.status)}>{student.status}</Badge></td>
            <td><button className="icon-button" onClick={() => setSelected(student)}><MoreHorizontal size={18} /></button></td>
          </tr>)}</tbody>
        </table>
      </section>

      <div className="mobile-card-list">
        {visibleStudents.map((student) => <article className="mobile-record-card" key={student.id} onClick={() => setSelected(student)}>
          <div className="mobile-record-card__header"><div className="table-person"><div className="avatar avatar--soft">{student.fullName[0]}</div><div><strong>{student.fullName}</strong><span>{student.age} лет</span></div></div><Badge tone={statusTone(student.status)}>{student.status}</Badge></div>
          <div className="mobile-record-card__grid"><div><span>Поток</span><strong>{data.streams.find((stream) => stream.id === student.streamId)?.name ?? '—'}</strong></div><div><span>Родитель</span><strong>{student.parentName}</strong></div>{role === 'admin' && <div><span>Оплата</span><strong>{formatMoney(student.paid)} / {formatMoney(student.price)}</strong></div>}<div><span>Фото</span><strong>{student.photoConsent ? 'Разрешено' : 'Нет согласия'}</strong></div></div>
        </article>)}
      </div>

      {!visibleStudents.length && <EmptyState icon={<Users />} title="Никого не найдено" text="Измените поиск или добавьте нового ребёнка." />}

      {addOpen && <Modal title="Добавить ребёнка" onClose={() => setAddOpen(false)} footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Отмена</Button><Button type="submit" form="add-student-form">Добавить</Button></>}>
        <form id="add-student-form" onSubmit={addStudent} className="form-grid">
          <Field label="Имя и фамилия"><input name="fullName" required placeholder="Амина Саги" /></Field>
          <Field label="Возраст"><input name="age" type="number" min="5" max="18" required placeholder="12" /></Field>
          <Field label="Имя родителя"><input name="parentName" required placeholder="Алия" /></Field>
          <Field label="Телефон родителя"><input name="parentPhone" required placeholder="+7 700 000 00 00" /></Field>
          <Field label="Поток"><select name="streamId">{data.streams.map((stream) => <option value={stream.id} key={stream.id}>{stream.name}</option>)}</select></Field>
          <Field label="Статус"><select name="status"><option>Ожидает начала</option><option>Обучается</option><option>Завершил</option><option>Отменил участие</option></select></Field>
          <Field label="Стоимость"><input name="price" type="number" defaultValue="45000" /></Field>
          <Field label="Оплачено"><input name="paid" type="number" defaultValue="0" /></Field>
          <Field label="Комментарий"><textarea name="notes" placeholder="Интересы, важные особенности…" /></Field>
          <label className="check-field"><input type="checkbox" name="photoConsent" /><span><strong>Есть согласие на фото и видео</strong><small>Не отмечайте без разрешения родителя</small></span></label>
        </form>
      </Modal>}

      {selected && <StudentDetails student={selected} data={data} role={role} onClose={() => setSelected(null)} updateData={updateData} />}
    </>
  )
}

function StudentDetails({ student, data, role, onClose, updateData }: { student: Student; data: AppData; role: UserRole; onClose: () => void; updateData: (fn: (data: AppData) => AppData) => void }) {
  const entries = data.journal.filter((entry) => entry.studentId === student.id)
  const avgGrade = entries.filter((entry) => entry.grade).length ? (entries.reduce((sum, entry) => sum + (entry.grade ?? 0), 0) / entries.filter((entry) => entry.grade).length).toFixed(1) : '—'
  const xp = entries.reduce((sum, entry) => sum + entry.xp, 0)
  const attendance = entries.length ? Math.round(entries.filter((entry) => ['present', 'late'].includes(entry.attendance)).length / entries.length * 100) : 0

  const updateStudent = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    updateData((current) => ({ ...current, students: current.students.map((item) => item.id === student.id ? { ...item, fullName: String(form.get('fullName')), age: Number(form.get('age')), parentName: role === 'admin' ? String(form.get('parentName')) : item.parentName, parentPhone: role === 'admin' ? String(form.get('parentPhone')) : item.parentPhone, status: String(form.get('status')) as StudentStatus, notes: String(form.get('notes')) } : item) }))
    onClose()
  }

  return <Modal title="Карточка ребёнка" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Закрыть</Button><Button type="submit" form="student-details-form">Сохранить</Button></>}>
    <div className="student-profile-head"><div className="avatar avatar--large">{student.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div><h3>{student.fullName}</h3><p>{data.streams.find((stream) => stream.id === student.streamId)?.name}</p><div className="badge-row"><Badge tone={statusTone(student.status)}>{student.status}</Badge>{role === 'admin' && <Badge tone={paymentTone(student)}>{paymentStatus(student)}</Badge>}</div></div></div>
    <div className="student-kpis"><div><strong>{attendance}%</strong><span>посещаемость</span></div><div><strong>{avgGrade}</strong><span>средняя оценка</span></div><div><strong>{xp}</strong><span>всего XP</span></div></div>
    <form id="student-details-form" onSubmit={updateStudent} className="form-grid">
      <Field label="Имя и фамилия"><input name="fullName" defaultValue={student.fullName} /></Field>
      <Field label="Возраст"><input name="age" type="number" defaultValue={student.age} /></Field>
      {role === 'admin' && <Field label="Родитель"><input name="parentName" defaultValue={student.parentName} /></Field>}
      {role === 'admin' && <Field label="Телефон"><input name="parentPhone" defaultValue={student.parentPhone} /></Field>}
      <Field label="Статус"><select name="status" defaultValue={student.status}><option>Ожидает начала</option><option>Обучается</option><option>Завершил</option><option>Отменил участие</option></select></Field>
      <Field label="Комментарий"><textarea name="notes" defaultValue={student.notes} /></Field>
    </form>
    {role === 'admin' && <div className="payment-summary"><div><span>Стоимость</span><strong>{formatMoney(student.price)}</strong></div><div><span>Оплачено</span><strong>{formatMoney(student.paid)}</strong></div><div><span>Остаток</span><strong>{formatMoney(Math.max(student.price - student.paid, 0))}</strong></div></div>}
  </Modal>
}

function StreamsPage({ data, role, updateData }: { data: AppData; role: UserRole; updateData: (fn: (data: AppData) => AppData) => void }) {
  const [addOpen, setAddOpen] = useState(false)
  const [selected, setSelected] = useState<CampStream | null>(null)

  const addStream = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const stream: CampStream = {
      id: uid('stream'), name: String(form.get('name')), startDate: String(form.get('startDate')), endDate: String(form.get('endDate')), time: String(form.get('time')), teacher: String(form.get('teacher')), capacity: Number(form.get('capacity')) || 10, status: 'Набор', program: String(form.get('program')).split('\n').filter(Boolean),
    }
    updateData((current) => ({ ...current, streams: [...current.streams, stream] }))
    setAddOpen(false)
  }

  return <>
    <SectionHeader title={role === 'teacher' ? 'Мои потоки' : 'Потоки'} description="Группы, даты, программа и заполненность" actions={role === 'admin' ? <Button icon={<Plus size={17} />} onClick={() => setAddOpen(true)}>Создать поток</Button> : undefined} />
    <div className="streams-grid">
      {data.streams.map((stream) => {
        const children = data.students.filter((student) => student.streamId === stream.id)
        const paid = children.reduce((sum, student) => sum + student.paid, 0)
        return <article className="stream-card" key={stream.id}>
          <div className="stream-card__top"><div className="stream-card__icon"><GraduationCap size={22} /></div><Badge tone={statusTone(stream.status)}>{stream.status}</Badge></div>
          <h2>{stream.name}</h2><p>{formatDate(stream.startDate)} — {formatDate(stream.endDate)} · {stream.time}</p>
          <div className="stream-card__stats"><div><span>Дети</span><strong>{children.length}/{stream.capacity}</strong></div><div><span>Преподаватель</span><strong>{stream.teacher}</strong></div>{role === 'admin' && <div><span>Получено</span><strong>{formatMoney(paid)}</strong></div>}</div>
          <ProgressBar value={children.length} max={stream.capacity} />
          <div className="stream-card__program">{stream.program.slice(0, 3).map((item, index) => <span key={item}><b>{index + 1}</b>{item}</span>)}</div>
          <Button variant="secondary" onClick={() => setSelected(stream)}>Открыть поток</Button>
        </article>
      })}
    </div>
    {addOpen && <Modal title="Создать поток" onClose={() => setAddOpen(false)} footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Отмена</Button><Button type="submit" form="add-stream-form">Создать</Button></>}><form id="add-stream-form" onSubmit={addStream} className="form-grid"><Field label="Название"><input name="name" placeholder="IT Camp · 6–10 июля" required /></Field><Field label="Преподаватель"><input name="teacher" defaultValue="Арлан" /></Field><Field label="Дата начала"><input name="startDate" type="date" required /></Field><Field label="Дата окончания"><input name="endDate" type="date" required /></Field><Field label="Время"><input name="time" defaultValue="09:00–13:00" /></Field><Field label="Количество мест"><input name="capacity" type="number" defaultValue="10" /></Field><Field label="Программа по дням"><textarea name="program" rows={5} defaultValue={'Сайт на HTML/CSS\nМобильное приложение\n3D-игра\nУмный дом Arduino\nМонтаж и питчинг'} /></Field></form></Modal>}
    {selected && <Modal title={selected.name} onClose={() => setSelected(null)}><div className="stream-detail"><div className="stream-detail__header"><div><Badge tone={statusTone(selected.status)}>{selected.status}</Badge><h3>{formatDate(selected.startDate)} — {formatDate(selected.endDate)}</h3><p>{selected.time} · преподаватель {selected.teacher}</p></div><div className="capacity-big"><strong>{data.students.filter((student) => student.streamId === selected.id).length}</strong><span>из {selected.capacity} мест</span></div></div><h3>Программа</h3><div className="program-list">{selected.program.map((item, index) => <div key={item}><span>День {index + 1}</span><strong>{item}</strong></div>)}</div><h3>Дети</h3><div className="people-list">{data.students.filter((student) => student.streamId === selected.id).map((student) => <div className="person-row" key={student.id}><div className="avatar avatar--soft">{student.fullName[0]}</div><div className="person-row__main"><strong>{student.fullName}</strong><span>{student.age} лет</span></div><Badge tone={statusTone(student.status)}>{student.status}</Badge></div>)}</div></div></Modal>}
  </>
}

function JournalPage({ data, updateData }: { data: AppData; updateData: (fn: (data: AppData) => AppData) => void }) {
  const [streamId, setStreamId] = useState(data.streams[0]?.id ?? '')
  const currentStream = data.streams.find((stream) => stream.id === streamId) ?? data.streams[0]
  const [date, setDate] = useState(currentStream?.startDate ?? new Date().toISOString().slice(0, 10))
  const streamStudents = data.students.filter((student) => student.streamId === streamId && student.status !== 'Отменил участие')

  const changeStream = (nextStreamId: string) => {
    setStreamId(nextStreamId)
    const nextStream = data.streams.find((stream) => stream.id === nextStreamId)
    if (nextStream) setDate(nextStream.startDate)
  }

  const getEntry = (studentId: string) => data.journal.find((entry) => entry.studentId === studentId && entry.streamId === streamId && entry.date === date)

  const updateEntry = (studentId: string, patch: Partial<JournalEntry>) => {
    updateData((current) => {
      const existing = current.journal.find((entry) => entry.studentId === studentId && entry.streamId === streamId && entry.date === date)
      if (existing) return { ...current, journal: current.journal.map((entry) => entry.id === existing.id ? { ...entry, ...patch } : entry) }
      const next: JournalEntry = { id: uid('journal'), studentId, streamId, date, attendance: 'present', grade: null, xp: 0, comment: '', ...patch }
      return { ...current, journal: [...current.journal, next] }
    })
  }

  const markAllPresent = () => streamStudents.forEach((student) => updateEntry(student.id, { attendance: 'present' }))
  const filled = streamStudents.filter((student) => getEntry(student.id)).length
  const present = streamStudents.filter((student) => ['present', 'late'].includes(getEntry(student.id)?.attendance ?? '')).length

  return <>
    <SectionHeader title="Электронный журнал" description="Посещаемость, оценки, XP и комментарии" actions={<Button variant="secondary" icon={<Download size={17} />} onClick={() => exportStudentsWorkbook(data)}>Скачать Excel</Button>} />
    <section className="journal-controls panel">
      <div><Field label="Поток"><select value={streamId} onChange={(event) => changeStream(event.target.value)}>{data.streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select></Field><Field label="Дата"><input type="date" value={date} min={currentStream?.startDate} max={currentStream?.endDate} onChange={(event) => setDate(event.target.value)} /></Field></div>
      <div className="journal-overview"><div><strong>{present}/{streamStudents.length}</strong><span>присутствуют</span></div><div><strong>{filled}/{streamStudents.length}</strong><span>заполнено</span></div><Button variant="secondary" size="sm" onClick={markAllPresent} icon={<Check size={16} />}>Все присутствуют</Button></div>
    </section>

    <div className="journal-list">
      {streamStudents.map((student) => {
        const entry = getEntry(student.id)
        return <article className="journal-card" key={student.id}>
          <div className="journal-card__person"><div className="avatar avatar--soft">{student.fullName[0]}</div><div><strong>{student.fullName}</strong><span>{student.age} лет</span></div>{entry && <Badge tone="green">Сохранено</Badge>}</div>
          <div className="journal-card__fields">
            <div className="attendance-picker"><span className="mini-label">Посещение</span><div>{([['present', 'Был'], ['late', 'Опоздал'], ['absent', 'Нет'], ['excused', 'Уваж.']] as [AttendanceStatus, string][]).map(([value, label]) => <button key={value} className={cn((entry?.attendance ?? 'present') === value && 'active', `attendance-${value}`)} onClick={() => updateEntry(student.id, { attendance: value })}>{label}</button>)}</div></div>
            <div className="grade-picker"><span className="mini-label">Оценка</span><div>{[1, 2, 3, 4, 5].map((grade) => <button key={grade} className={entry?.grade === grade ? 'active' : ''} onClick={() => updateEntry(student.id, { grade })}>{grade}</button>)}</div></div>
            <Field label="XP"><input type="number" value={entry?.xp ?? 0} step="50" onChange={(event) => updateEntry(student.id, { xp: Number(event.target.value) })} /></Field>
            <Field label="Комментарий"><input placeholder="Как прошёл урок…" value={entry?.comment ?? ''} onChange={(event) => updateEntry(student.id, { comment: event.target.value })} /></Field>
          </div>
        </article>
      })}
    </div>
    {!streamStudents.length && <EmptyState icon={<ClipboardCheck />} title="В потоке пока нет детей" text="Добавьте детей в этот поток, чтобы заполнить журнал." />}
  </>
}

function FinancePage({ data, updateData }: { data: AppData; updateData: (fn: (data: AppData) => AppData) => void }) {
  const [addOpen, setAddOpen] = useState(false)
  const income = data.transactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)
  const expense = data.transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
  const debt = data.students.reduce((sum, student) => sum + Math.max(student.price - student.paid, 0), 0)
  const expenseCategories = Object.entries(data.transactions.filter((item) => item.type === 'expense').reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.category]: (acc[item.category] ?? 0) + item.amount }), {})).map(([name, value]) => ({ name, value }))

  const addTransaction = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const transaction: FinanceTransaction = { id: uid('finance'), date: String(form.get('date')), type: String(form.get('type')) as 'income' | 'expense', category: String(form.get('category')), amount: Number(form.get('amount')), streamId: String(form.get('streamId') || '') || undefined, studentId: String(form.get('studentId') || '') || undefined, comment: String(form.get('comment') || '') }
    updateData((current) => ({ ...current, transactions: [transaction, ...current.transactions] }))
    setAddOpen(false)
  }

  return <>
    <SectionHeader title="Финансы" description="Доступно только администратору" actions={<><Button variant="secondary" icon={<Download size={17} />} onClick={() => exportFinanceWorkbook(data)}>Скачать Excel</Button><Button icon={<Plus size={17} />} onClick={() => setAddOpen(true)}>Добавить операцию</Button></>} />
    <div className="stats-grid">
      <StatCard label="Доходы" value={formatMoney(income)} helper="внесённые оплаты" icon={<Banknote size={21} />} accent="green" />
      <StatCard label="Расходы" value={formatMoney(expense)} helper="все категории" icon={<ReceiptText size={21} />} accent="orange" />
      <StatCard label="Прибыль" value={formatMoney(income - expense)} helper="до налогов" icon={<TrendingUp size={21} />} accent="purple" />
      <StatCard label="Остатки оплат" value={formatMoney(debt)} helper="по детям" icon={<CircleDollarSign size={21} />} />
    </div>
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel__header"><div><h2>Последние операции</h2><p>{data.transactions.length} записей</p></div></div>
        <div className="transactions-list">{data.transactions.map((item) => <div className="transaction-row" key={item.id}><div className={cn('transaction-icon', item.type === 'income' ? 'income' : 'expense')}>{item.type === 'income' ? <TrendingUp size={18} /> : <ReceiptText size={18} />}</div><div className="transaction-row__main"><strong>{item.category}</strong><span>{formatDate(item.date)} · {item.comment || 'Без комментария'}</span></div><strong className={item.type === 'income' ? 'money-positive' : 'money-negative'}>{item.type === 'income' ? '+' : '−'}{formatMoney(item.amount)}</strong></div>)}</div>
      </section>
      <section className="panel">
        <div className="panel__header"><div><h2>Структура расходов</h2><p>По категориям</p></div></div>
        <div className="pie-layout"><div className="pie-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={expenseCategories} dataKey="value" innerRadius={55} outerRadius={82} paddingAngle={3}>{expenseCategories.map((_, index) => <Cell key={index} fill={['#5B7CFA', '#F59E0B', '#8B5CF6', '#22C55E', '#EF4444'][index % 5]} />)}</Pie><Tooltip formatter={(value) => formatMoney(Number(value))} /></PieChart></ResponsiveContainer><div><strong>{formatMoney(expense)}</strong><span>расходов</span></div></div><div className="legend-list">{expenseCategories.map((item, index) => <div key={item.name}><span style={{ background: ['#5B7CFA', '#F59E0B', '#8B5CF6', '#22C55E', '#EF4444'][index % 5] }} /><p>{item.name}</p><strong>{formatMoney(item.value)}</strong></div>)}</div></div>
      </section>
    </div>
    {addOpen && <Modal title="Добавить операцию" onClose={() => setAddOpen(false)} footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Отмена</Button><Button type="submit" form="add-finance-form">Сохранить</Button></>}><form id="add-finance-form" onSubmit={addTransaction} className="form-grid"><Field label="Тип"><select name="type"><option value="income">Доход</option><option value="expense">Расход</option></select></Field><Field label="Дата"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field label="Категория"><input name="category" placeholder="Оплата лагеря / Реклама" required /></Field><Field label="Сумма"><input name="amount" type="number" min="1" required /></Field><Field label="Поток"><select name="streamId"><option value="">Без привязки</option>{data.streams.map((stream) => <option value={stream.id} key={stream.id}>{stream.name}</option>)}</select></Field><Field label="Ребёнок"><select name="studentId"><option value="">Без привязки</option>{data.students.map((student) => <option value={student.id} key={student.id}>{student.fullName}</option>)}</select></Field><Field label="Комментарий"><textarea name="comment" /></Field></form></Modal>}
  </>
}

function MarketingPage({ data, updateData }: { data: AppData; updateData: (fn: (data: AppData) => AppData) => void }) {
  const [selected, setSelected] = useState<ContentItem | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const filtered = data.content.filter((item) => statusFilter === 'all' || item.status === statusFilter)

  const updateContent = (id: string, patch: Partial<ContentItem>) => {
    updateData((current) => ({ ...current, content: current.content.map((item) => item.id === id ? { ...item, ...patch } : item) }))
    setSelected((current) => current?.id === id ? { ...current, ...patch } : current)
  }

  const addContent = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const item: ContentItem = {
      id: uid('content'),
      date: String(form.get('date')),
      platform: String(form.get('platform')) as ContentItem['platform'],
      format: String(form.get('format')),
      rubric: String(form.get('rubric')),
      topic: String(form.get('topic')),
      goal: String(form.get('goal')),
      status: 'Идея',
      hook: String(form.get('hook')),
      script: String(form.get('script')),
      shots: String(form.get('shots')).split('\n').map((shot) => shot.trim()).filter(Boolean),
      cta: String(form.get('cta')),
    }
    updateData((current) => ({ ...current, content: [...current.content, item] }))
    setAddOpen(false)
  }

  return <>
    <SectionHeader title="Контент-план" description="Идеи, съёмка, сценарии и результаты" actions={<><Button variant="secondary" icon={<Download size={17} />} onClick={() => exportMarketingWorkbook(data)}>Скачать Excel</Button><Button icon={<Plus size={17} />} onClick={() => setAddOpen(true)}>Добавить публикацию</Button></>} />
    <div className="toolbar"><div className="segmented">{['all', 'Идея', 'Нужно снять', 'Монтаж', 'Готово', 'Опубликовано'].map((status) => <button key={status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>{status === 'all' ? 'Весь план' : status}</button>)}</div></div>
    <div className="content-plan-grid">{filtered.map((item) => <article className="content-plan-card" key={item.id} onClick={() => setSelected(item)}><div className="content-plan-card__top"><div className="date-tile"><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(`${item.date}T00:00:00`))}</span></div><Badge tone={statusTone(item.status)}>{item.status}</Badge></div><span className="content-platform">{item.platform} · {item.format}</span><h2>{item.topic}</h2><p>{item.hook}</p><div className="content-plan-card__footer"><span><Target size={15} /> {item.goal}</span><button className="icon-button"><MoreHorizontal size={18} /></button></div></article>)}</div>
    {!filtered.length && <EmptyState icon={<CalendarDays />} title="В этом статусе пусто" text="Выберите другой фильтр или создайте новый план с AI." />}
    {addOpen && <Modal title="Добавить публикацию" onClose={() => setAddOpen(false)} footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Отмена</Button><Button type="submit" form="add-content-form">Добавить</Button></>}>
      <form id="add-content-form" onSubmit={addContent} className="form-grid">
        <Field label="Дата"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Площадка"><select name="platform"><option>Instagram</option><option>TikTok</option><option>Stories</option><option>Threads</option></select></Field>
        <Field label="Формат"><input name="format" placeholder="Reels · монтаж без голоса" required /></Field>
        <Field label="Рубрика"><input name="rubric" placeholder="Результаты детей" required /></Field>
        <Field label="Тема"><input name="topic" placeholder="Что ребёнок создаст за 5 дней" required /></Field>
        <Field label="Цель"><input name="goal" placeholder="Продажа ближайшего потока" required /></Field>
        <Field label="Хук"><textarea name="hook" placeholder="Первая фраза или текст на экране" required /></Field>
        <Field label="Сценарий"><textarea name="script" rows={5} placeholder="Ход ролика по секундам" required /></Field>
        <Field label="Кадры — каждый с новой строки"><textarea name="shots" rows={5} placeholder={'Вход ребёнка\nКрупно код\nГотовый проект'} /></Field>
        <Field label="Призыв"><input name="cta" placeholder="Напишите «ЛАГЕРЬ»" /></Field>
      </form>
    </Modal>}
    {selected && <Modal title="Сценарий публикации" onClose={() => setSelected(null)} footer={<><Button variant="secondary" onClick={() => setSelected(null)}>Закрыть</Button><Button onClick={() => updateContent(selected.id, { status: selected.status === 'Опубликовано' ? 'Опубликовано' : 'Готово' })}>Сохранить изменения</Button></>}>
      <div className="content-detail-head"><div><Badge tone={statusTone(selected.status)}>{selected.status}</Badge><h3>{selected.topic}</h3><p>{selected.platform} · {selected.format} · {formatDate(selected.date)}</p></div><select value={selected.status} onChange={(event) => updateContent(selected.id, { status: event.target.value as ContentStatus })}><option>Идея</option><option>Нужно снять</option><option>Монтаж</option><option>Готово</option><option>Опубликовано</option></select></div>
      <div className="script-section"><span>Хук</span><textarea value={selected.hook} onChange={(event) => updateContent(selected.id, { hook: event.target.value })} /></div>
      <div className="script-section"><span>Сценарий</span><textarea rows={5} value={selected.script} onChange={(event) => updateContent(selected.id, { script: event.target.value })} /></div>
      <div className="script-section"><span>Кадры для съёмки</span><div className="shots-list">{selected.shots.map((shot, index) => <div key={`${shot}-${index}`}><span>{index + 1}</span><p>{shot}</p></div>)}</div></div>
      <div className="script-section"><span>Призыв</span><input value={selected.cta} onChange={(event) => updateContent(selected.id, { cta: event.target.value })} /></div>
      <div className="metrics-fields"><Field label="Просмотры"><input type="number" value={selected.views ?? 0} onChange={(event) => updateContent(selected.id, { views: Number(event.target.value) })} /></Field><Field label="Лиды"><input type="number" value={selected.leads ?? 0} onChange={(event) => updateContent(selected.id, { leads: Number(event.target.value) })} /></Field></div>
    </Modal>}
  </>
}

function TasksPage({ data, updateData }: { data: AppData; updateData: (fn: (data: AppData) => AppData) => void }) {
  const [addOpen, setAddOpen] = useState(false)
  const statuses: MarketingTask['status'][] = ['Запланировано', 'В работе', 'На согласовании', 'Готово']
  const updateTask = (id: string, status: MarketingTask['status']) => updateData((current) => ({ ...current, marketingTasks: current.marketingTasks.map((task) => task.id === id ? { ...task, status } : task) }))
  const addTask = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    updateData((current) => ({ ...current, marketingTasks: [...current.marketingTasks, { id: uid('task'), title: String(form.get('title')), dueDate: String(form.get('dueDate')), priority: String(form.get('priority')) as MarketingTask['priority'], status: 'Запланировано' }] }))
    setAddOpen(false)
  }
  return <>
    <SectionHeader title="Задачи SMM" description="Что снять, смонтировать и опубликовать" actions={<Button icon={<Plus size={17} />} onClick={() => setAddOpen(true)}>Добавить задачу</Button>} />
    <div className="kanban-board">{statuses.map((status) => <section className="kanban-column" key={status}><header><div><span className={`kanban-dot kanban-dot--${status.replaceAll(' ', '-').toLowerCase()}`} /><strong>{status}</strong></div><Badge>{data.marketingTasks.filter((task) => task.status === status).length}</Badge></header><div>{data.marketingTasks.filter((task) => task.status === status).map((task) => <article className="kanban-card" key={task.id}><Badge tone={task.priority === 'Высокий' ? 'red' : task.priority === 'Средний' ? 'amber' : 'neutral'}>{task.priority}</Badge><h3>{task.title}</h3><span><CalendarDays size={14} /> до {formatDate(task.dueDate)}</span><select value={task.status} onChange={(event) => updateTask(task.id, event.target.value as MarketingTask['status'])}>{statuses.map((option) => <option key={option}>{option}</option>)}</select></article>)}</div></section>)}</div>
    {addOpen && <Modal title="Новая задача" onClose={() => setAddOpen(false)} footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Отмена</Button><Button type="submit" form="add-task-form">Добавить</Button></>}><form id="add-task-form" onSubmit={addTask} className="form-grid"><Field label="Задача"><input name="title" required placeholder="Снять интервью с детьми" /></Field><Field label="Дедлайн"><input name="dueDate" type="date" required /></Field><Field label="Приоритет"><select name="priority"><option>Средний</option><option>Высокий</option><option>Низкий</option></select></Field></form></Modal>}
  </>
}

function AiPage({ data, updateData }: { data: AppData; updateData: (fn: (data: AppData) => AppData) => void }) {
  const [prompt, setPrompt] = useState('Создай контент-план на 7 дней для набора детей 8–16 лет в пятидневный IT-лагерь. Нужны разные типы Reels, Stories и Threads без шаблонных рекламных фраз.')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState('')
  const [generated, setGenerated] = useState<ContentItem[]>([])

  const generate = async () => {
    setLoading(true)
    setAnswer('')
    setGenerated([])
    const context = {
      camp: 'Level Up IT Camp, Астана, Күлтегін 21',
      audience: 'родители детей 8–16 лет',
      program: data.streams[0]?.program ?? ['Сайт', 'Мобильное приложение', 'Игра', 'Arduino', 'Питчинг'],
      price: '45 000–70 000 ₸',
      upcomingStreams: data.streams.map((stream) => ({ name: stream.name, dates: `${stream.startDate} — ${stream.endDate}`, status: stream.status })),
      existingContent: data.content.map((item) => ({ topic: item.topic, format: item.format, views: item.views, leads: item.leads })),
      tone: 'живой, конкретный, без типичных AI-клише',
    }
    try {
      const response = await api.generateMarketing(prompt, context)
      const items = (response.items as Omit<ContentItem, 'id' | 'status'>[]).map((item, index) => ({
        ...item,
        id: uid(`ai-${index}`),
        status: 'Идея' as ContentStatus,
      }))
      setGenerated(items)
      setAnswer(response.summary || 'План сформирован на основе данных лагеря.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось получить ответ Gemini.'
      setAnswer(message)
    } finally {
      setLoading(false)
    }
  }

  const addGenerated = () => {
    updateData((current) => ({ ...current, content: [...current.content, ...generated] }))
    setAnswer('Готово: идеи добавлены в контент-план. Теперь каждую можно открыть, изменить статус и доработать сценарий.')
    setGenerated([])
  }

  return <>
    <SectionHeader title="AI-маркетолог" description="Контент и сценарии с контекстом именно твоего лагеря" />
    <div className="ai-layout">
      <section className="ai-chat panel">
        <div className="ai-chat__intro"><div className="ai-orb"><Sparkles size={24} /></div><div><h2>Level Up Marketing AI</h2><p>Знает программу, аудиторию, прошлый контент и запрещённые шаблонные фразы.</p></div></div>
        <div className="ai-context"><span><Check size={15} /> Программа лагеря</span><span><Check size={15} /> ЦА: родители 8–16 лет</span><span><Check size={15} /> Форматы Reels и Stories</span><span><Check size={15} /> Проверка повторов</span></div>
        <div className="ai-prompt-box"><textarea rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} /><div><small>Gemini вызывается через сервер, поэтому API-ключ не попадает в браузер.</small><Button icon={<Sparkles size={17} />} disabled={loading || !prompt.trim()} onClick={generate}>{loading ? 'Анализирую…' : 'Создать план'}</Button></div></div>
        {answer && <div className="ai-answer"><div className="ai-orb ai-orb--small"><Bot size={18} /></div><p>{answer}</p></div>}
      </section>
      <aside className="panel ai-tools"><div className="panel__header"><div><h2>Быстрые команды</h2><p>Можно вставить в запрос</p></div></div>{['Сделай сценарий Reels без озвучки', 'Придумай 10 живых хуков без клише', 'Разложи съёмку по конкретным кадрам', 'Проанализируй результаты контента', 'Адаптируй идею под Stories'].map((item) => <button key={item} onClick={() => setPrompt(item)}><MessageSquareText size={17} /><span>{item}</span></button>)}</aside>
    </div>
    {generated.length > 0 && <section className="panel generated-plan"><div className="panel__header"><div><h2>Черновик контент-плана</h2><p>{generated.length} идей готово к добавлению</p></div><Button onClick={addGenerated} icon={<Plus size={17} />}>Добавить в план</Button></div><div className="generated-list">{generated.map((item, index) => <article key={item.id}><div className="generated-list__index">{String(index + 1).padStart(2, '0')}</div><div><div className="badge-row"><Badge tone="blue">{item.platform}</Badge><Badge>{item.format}</Badge></div><h3>{item.topic}</h3><p><strong>Хук:</strong> {item.hook}</p><div className="generated-meta"><span><CalendarDays size={14} /> {formatDate(item.date)}</span><span><Target size={14} /> {item.goal}</span><span><PenLine size={14} /> {item.shots.length} кадров</span></div></div></article>)}</div></section>}
  </>
}

function SettingsPage({ data, user, onReset }: { data: AppData; user: AuthUser; onReset: () => Promise<void> }) {
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('currentPassword') || '')
    const newPassword = String(form.get('newPassword') || '')
    const repeatPassword = String(form.get('repeatPassword') || '')
    setPasswordMessage('')
    setPasswordError('')
    if (newPassword !== repeatPassword) {
      setPasswordError('Новые пароли не совпадают.')
      return
    }
    setChangingPassword(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      setPasswordMessage('Пароль изменён. Используй его при следующем входе.')
      event.currentTarget.reset()
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Не удалось изменить пароль.')
    } finally {
      setChangingPassword(false)
    }
  }

  const reset = async () => {
    if (!window.confirm('Вернуть первоначальные данные? Все текущие изменения будут удалены.')) return
    await onReset()
  }

  return <>
    <SectionHeader title="Настройки" description="Система, безопасность и пароль аккаунта" />
    <div className="settings-grid">
      <section className="panel settings-card">
        <div className="settings-icon"><Activity /></div>
        <h2>Встроенная база</h2>
        <p>Все данные команды сохраняются в SQLite-файле внутри папки проекта. Никакой отдельный сервис базы данных не требуется.</p>
        <Badge tone="green">SQLite работает</Badge>
      </section>
      {user.role !== 'teacher' && <section className="panel settings-card">
        <div className="settings-icon"><Sparkles /></div>
        <h2>Gemini</h2>
        <p>Ключ берётся из файла <code>.env</code> на сервере и никогда не отправляется в браузер сотрудника.</p>
        <Badge tone="green">Серверное подключение</Badge>
      </section>}
      {user.role === 'admin' && <section className="panel settings-card">
        <div className="settings-icon"><Download /></div>
        <h2>Резервная копия</h2>
        <p>Скачай полную копию детей, журнала, финансов и маркетинга в одном JSON-файле.</p>
        <a className="button button--secondary backup-link" href="/api/backup">Скачать резервную копию</a>
      </section>}
      {user.role === 'admin' && <section className="panel settings-card settings-card--danger">
        <div className="settings-icon"><X /></div>
        <h2>Сбросить данные</h2>
        <p>Удалит текущие записи и вернёт первоначальный пример наполнения.</p>
        <Button variant="danger" onClick={() => void reset()}>Сбросить данные</Button>
      </section>}
    </div>

    <div className="settings-two-column">
      <section className="panel password-panel">
        <div className="panel__header"><div><h2>Сменить пароль</h2><p>{user.displayName} · {roleLabels[user.role]}</p></div></div>
        <form onSubmit={changePassword} className="password-form">
          <Field label="Текущий пароль"><input name="currentPassword" type="password" autoComplete="current-password" required /></Field>
          <Field label="Новый пароль"><input name="newPassword" type="password" minLength={8} autoComplete="new-password" required /></Field>
          <Field label="Повтори новый пароль"><input name="repeatPassword" type="password" minLength={8} autoComplete="new-password" required /></Field>
          {passwordError && <div className="login-error">{passwordError}</div>}
          {passwordMessage && <div className="success-message">{passwordMessage}</div>}
          <Button type="submit" disabled={changingPassword}>{changingPassword ? 'Сохраняю…' : 'Изменить пароль'}</Button>
        </form>
      </section>
      {user.role === 'admin' && <section className="panel data-summary">
        <h2>Сейчас в системе</h2>
        <div><span><Users /> {data.students.length} детей</span><span><CalendarDays /> {data.streams.length} потока</span><span><ClipboardCheck /> {data.journal.length} записей журнала</span><span><WalletCards /> {data.transactions.length} финансовых операций</span><span><Target /> {data.content.length} публикации</span></div>
      </section>}
    </div>
  </>
}

export default App

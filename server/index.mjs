import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { networkInterfaces } from 'node:os'
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  addAudit,
  createSession,
  dbPath,
  deleteSession,
  findUserById,
  findUserByUsername,
  getRecentAudit,
  getUserBySessionToken,
  readAllSections,
  resetSections,
  rootDir,
  updateUserPassword,
  verifyPassword,
  writeSections,
} from './db.mjs'

const PORT = Number(process.env.PORT || 3001)
const HOST = process.env.HOST || '0.0.0.0'
const distDir = resolve(rootDir, 'dist')
const isDev = process.env.NODE_ENV !== 'production' && !existsSync(resolve(distDir, 'index.html'))
const maxBodyBytes = 3 * 1024 * 1024

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

function text(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...extraHeaders })
  res.end(payload)
}

function parseCookies(req) {
  const header = req.headers.cookie || ''
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
      }),
  )
}

function sessionCookie(token, maxAge = 14 * 24 * 60 * 60) {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''
  const sameSite = secure ? 'None' : 'Lax'
  return `camp_session=${encodeURIComponent(token)}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secure}`
}

async function getAuthUser(req) {
  return (await getUserBySessionToken(parseCookies(req).camp_session)) || (await getTelegramAuthUser(req))
}

function listEnvIds(name) {
  return new Set(
    String(process.env[name] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

function telegramRoleForUser(telegramUser) {
  const id = String(telegramUser?.id || '')
  if (!id) return null
  if (listEnvIds('TELEGRAM_ADMIN_IDS').has(id)) return 'admin'
  if (listEnvIds('TELEGRAM_TEACHER_IDS').has(id)) return 'teacher'
  if (listEnvIds('TELEGRAM_SMM_IDS').has(id)) return 'smm'
  return null
}

function safeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function verifyTelegramInitData(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!botToken || !initData) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  const authDate = Number(params.get('auth_date') || 0)
  params.delete('hash')

  if (!hash || !authDate) return null
  const maxAgeSeconds = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 7 * 24 * 60 * 60)
  if (maxAgeSeconds > 0 && Date.now() / 1000 - authDate > maxAgeSeconds) return null

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  if (!safeEqualHex(expectedHash, hash)) return null

  try {
    return JSON.parse(params.get('user') || 'null')
  } catch {
    return null
  }
}

async function getTelegramAuthUser(req) {
  const telegramUser = verifyTelegramInitData(req.headers['x-telegram-init-data'])
  const role = telegramRoleForUser(telegramUser)
  if (!role) return null

  const userId = role === 'admin' ? 'user-admin' : role === 'teacher' ? 'user-teacher' : 'user-smm'
  return (await findUserById(userId)) || null
}

async function requireUser(req, res, roles) {
  const user = await getAuthUser(req)
  if (!user) {
    json(res, 401, { error: 'Нужно войти в систему.' })
    return null
  }
  if (roles && !roles.includes(user.role)) {
    json(res, 403, { error: 'Нет доступа к этому разделу.' })
    return null
  }
  return user
}

async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBodyBytes) throw new Error('BODY_TOO_LARGE')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('INVALID_JSON')
  }
}

function emptyData() {
  return { students: [], streams: [], journal: [], transactions: [], content: [], marketingTasks: [] }
}

function filterDataForRole(all, role) {
  const base = { ...emptyData(), ...all }
  if (role === 'admin') return base
  if (role === 'teacher') {
    return {
      ...base,
      students: base.students.map((student) => ({ ...student, price: 0, paid: 0 })),
      transactions: [],
      content: [],
      marketingTasks: [],
    }
  }
  return {
    ...base,
    students: [],
    journal: [],
    transactions: [],
    streams: base.streams.map(({ id, name, startDate, endDate, time, teacher, capacity, status, program }) => ({
      id, name, startDate, endDate, time, teacher, capacity, status, program,
    })),
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function mergeTeacherStudents(existingStudents, incomingStudents) {
  const incomingById = new Map(ensureArray(incomingStudents).map((student) => [student.id, student]))
  return ensureArray(existingStudents).map((student) => {
    const incoming = incomingById.get(student.id)
    if (!incoming) return student
    return {
      ...student,
      fullName: String(incoming.fullName ?? student.fullName).slice(0, 120),
      age: Math.max(0, Math.min(99, Number(incoming.age ?? student.age))),
      status: incoming.status ?? student.status,
      notes: String(incoming.notes ?? student.notes).slice(0, 3000),
    }
  })
}

function buildAllowedUpdates(user, incoming, current) {
  const updates = {}
  if (user.role === 'admin') {
    for (const key of ['students', 'streams', 'journal', 'transactions', 'content', 'marketingTasks']) {
      if (Object.hasOwn(incoming, key)) updates[key] = ensureArray(incoming[key])
    }
    return updates
  }
  if (user.role === 'teacher') {
    if (Object.hasOwn(incoming, 'students')) updates.students = mergeTeacherStudents(current.students, incoming.students)
    if (Object.hasOwn(incoming, 'journal')) updates.journal = ensureArray(incoming.journal)
    return updates
  }
  if (Object.hasOwn(incoming, 'content')) updates.content = ensureArray(incoming.content)
  if (Object.hasOwn(incoming, 'marketingTasks')) updates.marketingTasks = ensureArray(incoming.marketingTasks)
  return updates
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || []
  return parts.map((part) => part.text || '').join('').trim()
}

function parseJsonFromModel(textValue) {
  const clean = textValue
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  return JSON.parse(clean)
}

function contentPlanSchema() {
  return {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string' },
            platform: { type: 'string', enum: ['Instagram', 'TikTok', 'Threads', 'Stories'] },
            format: { type: 'string' },
            rubric: { type: 'string' },
            topic: { type: 'string' },
            goal: { type: 'string' },
            hook: { type: 'string' },
            script: { type: 'string' },
            shots: { type: 'array', items: { type: 'string' } },
            cta: { type: 'string' },
          },
          required: ['date', 'platform', 'format', 'rubric', 'topic', 'goal', 'hook', 'script', 'shots', 'cta'],
        },
      },
    },
    required: ['summary', 'items'],
  }
}

function buildMarketingPrompt(prompt, context) {
  return `
Ты — ведущий маркетолог и контент-мейкер детских образовательных проектов с 20-летним практическим опытом.
Работаешь для Level Up IT Camp в Астане. Твоя задача — давать реалистичный, конкретный и снимаемый контент, а не типичные AI-идеи.

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
- Не используй клише: «раскрой потенциал», «погрузись в мир», «незабываемые эмоции», «будущее начинается здесь».
- Не делай каждый материал прямой рекламой.
- Разделяй форматы: монтаж без голоса, POV, разговорный ролик, интервью, Stories, Threads.
- Для видео давай конкретные кадры, реплики, длительность и логику монтажа.
- Опирайся на реальные процессы лагеря: сайт, приложение, игра, Arduino, монтаж, личная защита проекта.
- Не выдумывай достижения, отзывы и цифры.
- Проверяй идеи на повторы с уже опубликованным контентом.
- Пиши естественным русским языком без канцелярита.
- Даты возвращай в формате YYYY-MM-DD.

КОНТЕКСТ ЛАГЕРЯ:
${JSON.stringify(context, null, 2)}

ЗАПРОС ПОЛЬЗОВАТЕЛЯ:
${prompt}

Верни только JSON вида {"summary":"...","items":[...]}. Каждая идея должна содержать date, platform, format, rubric, topic, goal, hook, script, shots, cta.
`.trim()
}

async function callGemini(prompt, context) {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    const error = new Error('GEMINI_KEY_MISSING')
    error.code = 'GEMINI_KEY_MISSING'
    throw error
  }

  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash'
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const body = {
    contents: [{ role: 'user', parts: [{ text: buildMarketingPrompt(prompt, context) }] }],
    generationConfig: {
      temperature: 0.85,
      responseFormat: {
        text: {
          mimeType: 'application/json',
          schema: contentPlanSchema(),
        },
      },
    },
  }

  if (process.env.GEMINI_SEARCH !== 'false') body.tools = [{ google_search: {} }]

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok && body.tools) {
    delete body.tools
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    })
  }

  if (!response.ok) {
    const details = await response.text()
    const error = new Error(`Gemini API: ${response.status} ${details.slice(0, 600)}`)
    error.code = 'GEMINI_API_ERROR'
    throw error
  }

  const payload = await response.json()
  const textValue = extractGeminiText(payload)
  if (!textValue) {
    const error = new Error('Gemini вернул пустой ответ.')
    error.code = 'GEMINI_EMPTY'
    throw error
  }
  return parseJsonFromModel(textValue)
}

async function apiRouter(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      database: dbPath,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    })
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJsonBody(req)
    const username = String(body.username || '').trim()
    const password = String(body.password || '')
    const user = await findUserByUsername(username)
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      await addAudit(user?.id || null, 'login_failed', null, username)
      return json(res, 401, { error: 'Неверный логин или пароль.' })
    }
    const session = await createSession(user.id)
    await addAudit(user.id, 'login')
    return json(
      res,
      200,
      { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } },
      { 'Set-Cookie': sessionCookie(session.token) },
    )
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = parseCookies(req).camp_session
    const user = await getAuthUser(req)
    await deleteSession(token)
    if (user) await addAudit(user.id, 'logout')
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) })
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = await requireUser(req, res)
    if (!user) return
    if (!parseCookies(req).camp_session) {
      const session = await createSession(user.id)
      await addAudit(user.id, 'telegram_login')
      return json(res, 200, { user }, { 'Set-Cookie': sessionCookie(session.token) })
    }
    return json(res, 200, { user })
  }

  if (req.method === 'POST' && url.pathname === '/api/account/password') {
    const user = await requireUser(req, res)
    if (!user) return
    const body = await readJsonBody(req)
    const currentPassword = String(body.currentPassword || '')
    const newPassword = String(body.newPassword || '')
    const fullUser = await findUserByUsername(user.username)
    if (!verifyPassword(currentPassword, fullUser.passwordSalt, fullUser.passwordHash)) {
      return json(res, 400, { error: 'Текущий пароль указан неверно.' })
    }
    if (newPassword.length < 8) return json(res, 400, { error: 'Новый пароль должен содержать минимум 8 символов.' })
    await updateUserPassword(user.id, newPassword)
    await addAudit(user.id, 'password_changed')
    return json(res, 200, { ok: true })
  }

  if (req.method === 'GET' && url.pathname === '/api/data') {
    const user = await requireUser(req, res)
    if (!user) return
    return json(res, 200, { data: filterDataForRole(await readAllSections(), user.role) })
  }

  if (req.method === 'PATCH' && url.pathname === '/api/data') {
    const user = await requireUser(req, res)
    if (!user) return
    const body = await readJsonBody(req)
    const current = { ...emptyData(), ...(await readAllSections()) }
    const updates = buildAllowedUpdates(user, body.data || {}, current)
    if (Object.keys(updates).length) await writeSections(updates, user.id)
    const next = { ...current, ...updates }
    return json(res, 200, { data: filterDataForRole(next, user.role), savedAt: new Date().toISOString() })
  }

  if (req.method === 'POST' && url.pathname === '/api/data/reset') {
    const user = await requireUser(req, res, ['admin'])
    if (!user) return
    const next = await resetSections(user.id)
    return json(res, 200, { data: next })
  }

  if (req.method === 'GET' && url.pathname === '/api/backup') {
    const user = await requireUser(req, res, ['admin'])
    if (!user) return
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), data: await readAllSections() }, null, 2)
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="level-up-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    })
    return res.end(payload)
  }

  if (req.method === 'GET' && url.pathname === '/api/audit') {
    const user = await requireUser(req, res, ['admin'])
    if (!user) return
    return json(res, 200, { logs: await getRecentAudit(100) })
  }

  if (req.method === 'POST' && url.pathname === '/api/ai') {
    const user = await requireUser(req, res, ['admin', 'smm'])
    if (!user) return
    const body = await readJsonBody(req)
    const prompt = String(body.prompt || '').trim()
    if (!prompt) return json(res, 400, { error: 'Введите запрос для AI.' })
    try {
      const result = await callGemini(prompt, body.context || {})
      await addAudit(user.id, 'gemini_generation', 'content', prompt.slice(0, 240))
      return json(res, 200, result)
    } catch (error) {
      console.error('[Gemini]', error)
      if (error.code === 'GEMINI_KEY_MISSING') {
        return json(res, 503, { error: 'Gemini API ключ не указан. Добавьте GEMINI_API_KEY в файл .env и перезапустите приложение.' })
      }
      return json(res, 502, { error: 'Gemini не смог сформировать ответ.', details: String(error.message || error) })
    }
  }

  return json(res, 404, { error: 'API-маршрут не найден.' })
}

async function serveStatic(req, res, url) {
  if (isDev) return text(res, 404, 'Frontend dev server is running separately.')

  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'
  const requested = resolve(distDir, `.${pathname}`)
  if (!requested.startsWith(distDir + sep) && requested !== resolve(distDir, 'index.html')) {
    return text(res, 403, 'Forbidden')
  }

  let filePath = requested
  try {
    const info = await stat(filePath)
    if (info.isDirectory()) filePath = resolve(filePath, 'index.html')
  } catch {
    filePath = resolve(distDir, 'index.html')
  }

  try {
    const file = await readFile(filePath)
    const ext = extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    res.end(file)
  } catch {
    text(res, 404, 'Not found')
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  try {
    if (url.pathname.startsWith('/api/')) await apiRouter(req, res, url)
    else await serveStatic(req, res, url)
  } catch (error) {
    console.error('[Server error]', error)
    if (error.message === 'BODY_TOO_LARGE') return json(res, 413, { error: 'Слишком большой запрос.' })
    if (error.message === 'INVALID_JSON') return json(res, 400, { error: 'Некорректный JSON.' })
    if (!res.headersSent) json(res, 500, { error: 'Внутренняя ошибка сервера.' })
    else res.end()
  }
})

server.listen(PORT, HOST, () => {
  console.log(`\nLevel Up Camp OS запущен: http://localhost:${PORT}`)
  const localAddresses = Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => `http://${item.address}:${PORT}`)
  if (localAddresses.length) console.log(`С телефона в той же Wi-Fi сети: ${localAddresses.join('  ')}`)
  console.log(`База данных: ${dbPath}`)
  console.log(`Gemini: ${process.env.GEMINI_API_KEY?.trim() ? 'подключён' : 'ключ не указан'}\n`)
})

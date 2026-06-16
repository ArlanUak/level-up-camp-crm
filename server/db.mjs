import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const dataDir = resolve(rootDir, 'data')
mkdirSync(dataDir, { recursive: true })

const tursoUrl = process.env.TURSO_DATABASE_URL?.trim()
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN?.trim()
const useTurso = Boolean(tursoUrl)

const sqlitePath = process.env.DATABASE_PATH
  ? resolve(rootDir, process.env.DATABASE_PATH)
  : resolve(dataDir, 'level-up-camp.sqlite')

const dbPath = useTurso ? tursoUrl : sqlitePath

let db

async function createDatabase() {
  if (useTurso) {
    const { createClient } = await import('@libsql/client')
    const client = createClient({ url: tursoUrl, authToken: tursoAuthToken })
    return {
      provider: 'turso',
      exec: async (sql) => {
        for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
          await client.execute(statement)
        }
      },
      get: async (sql, args = []) => (await client.execute({ sql, args })).rows[0] || null,
      all: async (sql, args = []) => (await client.execute({ sql, args })).rows,
      run: async (sql, args = []) => {
        await client.execute({ sql, args })
      },
    }
  }

  const local = new DatabaseSync(sqlitePath)
  return {
    provider: 'sqlite',
    exec: async (sql) => local.exec(sql),
    get: async (sql, args = []) => local.prepare(sql).get(...args),
    all: async (sql, args = []) => local.prepare(sql).all(...args),
    run: async (sql, args = []) => {
      local.prepare(sql).run(...args)
    },
  }
}

function nowIso() {
  return new Date().toISOString()
}

function makePassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return { salt: salt.toString('hex'), hash: hash.toString('hex') }
}

export function verifyPassword(password, saltHex, hashHex) {
  const candidate = scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
  const expected = Buffer.from(hashHex, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

async function migrate() {
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'smm')),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_sections (
      section_key TEXT PRIMARY KEY,
      json_value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      section_key TEXT,
      created_at TEXT NOT NULL,
      details TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
  `)
}

async function seedUsers() {
  const count = Number((await db.get('SELECT COUNT(*) AS count FROM users'))?.count || 0)
  if (count > 0) return

  const users = [
    {
      id: 'user-admin',
      username: process.env.ADMIN_USERNAME || 'admin',
      displayName: process.env.ADMIN_NAME || 'РђСЂР»Р°РЅ',
      role: 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123',
    },
    {
      id: 'user-teacher',
      username: process.env.TEACHER_USERNAME || 'teacher',
      displayName: process.env.TEACHER_NAME || 'РџСЂРµРїРѕРґР°РІР°С‚РµР»СЊ',
      role: 'teacher',
      password: process.env.TEACHER_PASSWORD || 'teacher123',
    },
    {
      id: 'user-smm',
      username: process.env.SMM_USERNAME || 'smm',
      displayName: process.env.SMM_NAME || 'SMM',
      role: 'smm',
      password: process.env.SMM_PASSWORD || 'smm123',
    },
  ]

  for (const user of users) {
    const password = makePassword(user.password)
    await db.run(
      `INSERT INTO users (id, username, display_name, role, password_salt, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.username, user.displayName, user.role, password.salt, password.hash, nowIso()],
    )
  }
}

async function seedSections() {
  const count = Number((await db.get('SELECT COUNT(*) AS count FROM app_sections'))?.count || 0)
  if (count > 0) return

  const seed = JSON.parse(readFileSync(resolve(__dirname, 'seed-data.json'), 'utf8'))
  for (const [key, value] of Object.entries(seed)) {
    await db.run(
      `INSERT INTO app_sections (section_key, json_value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)`,
      [key, JSON.stringify(value), nowIso(), 'system'],
    )
  }
}

async function initializeDatabase() {
  db = await createDatabase()
  await migrate()
  await seedUsers()
  await seedSections()
}

await initializeDatabase()

export async function findUserByUsername(username) {
  return db.get(
    `SELECT id, username, display_name AS displayName, role, password_salt AS passwordSalt, password_hash AS passwordHash
     FROM users
     WHERE lower(username) = lower(?)`,
    [username],
  )
}

export async function findUserById(id) {
  return db.get(
    `SELECT id, username, display_name AS displayName, role
     FROM users
     WHERE id = ?`,
    [id],
  )
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  await db.run(`INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`, [
    tokenHash,
    userId,
    expires,
    nowIso(),
  ])
  return { token, expires }
}

export async function deleteSession(token) {
  if (!token) return
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash])
}

export async function getUserBySessionToken(token) {
  if (!token) return null
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()])
  return (
    (await db.get(
      `SELECT users.id, users.username, users.display_name AS displayName, users.role
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at >= ?`,
      [tokenHash, nowIso()],
    )) || null
  )
}

export async function updateUserPassword(userId, newPassword) {
  const password = makePassword(newPassword)
  await db.run('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?', [
    password.salt,
    password.hash,
    userId,
  ])
}

export async function readAllSections() {
  const rows = await db.all('SELECT section_key AS sectionKey, json_value AS jsonValue FROM app_sections')
  return Object.fromEntries(rows.map((row) => [row.sectionKey, JSON.parse(row.jsonValue)]))
}

export async function writeSection(sectionKey, value, userId) {
  await db.run(
    `INSERT INTO app_sections (section_key, json_value, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(section_key) DO UPDATE SET
       json_value = excluded.json_value,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
    [sectionKey, JSON.stringify(value), nowIso(), userId],
  )
  await addAudit(userId, 'update', sectionKey, `${Array.isArray(value) ? value.length : 1} records`)
}

export async function writeSections(entries, userId) {
  for (const [key, value] of Object.entries(entries)) await writeSection(key, value, userId)
}

export async function resetSections(userId) {
  const seed = JSON.parse(readFileSync(resolve(__dirname, 'seed-data.json'), 'utf8'))
  await writeSections(seed, userId)
  await addAudit(userId, 'reset', null, 'Reset to initial demo data')
  return seed
}

export async function addAudit(userId, action, sectionKey = null, details = null) {
  await db.run(
    `INSERT INTO audit_logs (user_id, action, section_key, created_at, details)
     VALUES (?, ?, ?, ?, ?)`,
    [userId || null, action, sectionKey, nowIso(), details],
  )
}

export async function getRecentAudit(limit = 50) {
  return db.all(
    `SELECT audit_logs.id, audit_logs.action, audit_logs.section_key AS sectionKey,
            audit_logs.created_at AS createdAt, audit_logs.details,
            users.display_name AS displayName
     FROM audit_logs
     LEFT JOIN users ON users.id = audit_logs.user_id
     ORDER BY audit_logs.id DESC
     LIMIT ?`,
    [limit],
  )
}

export { dbPath, rootDir }

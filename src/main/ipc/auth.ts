import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDb } from '../database/db'

const JWT_SECRET = 'truck-manager-local-secret-2025'
const JWT_EXPIRES = '8h'

export function registerAuthHandlers() {
  // Логин
  ipcMain.handle('auth:login', async (_e, { username, password }) => {
    try {
      const db = getDb()
      const user = db.prepare(
        'SELECT * FROM users WHERE username = ? AND active = 1'
      ).get(username) as any

      if (!user) return { ok: false, error: 'Неверный логин или пароль' }

      // При первом запуске — дефолтный пароль admin123
      let valid = false
      if (user.password_hash === '$2a$10$defaulthashwillbereplacedonFirstRun') {
        valid = password === 'admin123'
        if (valid) {
          // Сразу хэшируем нормально
          const hash = bcrypt.hashSync(password, 10)
          db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id)
        }
      } else {
        valid = bcrypt.compareSync(password, user.password_hash)
      }

      if (!valid) return { ok: false, error: 'Неверный логин или пароль' }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, display_name: user.display_name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      )

      return { ok: true, token, user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // Проверка токена
  ipcMain.handle('auth:verify', async (_e, token?: string) => {
    if (!token) return { ok: false }
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      return { ok: true, user: decoded }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('auth:logout', async () => ({ ok: true }))
}

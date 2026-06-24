import { ipcMain, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { getDb } from '../database/db'

function getDbPath() {
  return path.join(app.getPath('documents'), 'TruckManager', 'trucks.db')
}

function getBackupDir() {
  return path.join(app.getPath('documents'), 'TruckManager', 'backups')
}

export function registerBackupHandlers() {
  ipcMain.handle('backup:create', () => {
    try {
      const db = getDb()
      const backupDir = getBackupDir()
      const date = new Date().toISOString().slice(0, 10)
      const backupPath = path.join(backupDir, `trucks_${date}.db`)

      // Используем SQLite backup API — безопасно даже при открытой БД
      db.backup(backupPath)

      // Удаляем старые бэкапы (оставляем последние 30)
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('trucks_') && f.endsWith('.db'))
        .sort()
      if (files.length > 30) {
        files.slice(0, files.length - 30).forEach(f => {
          fs.unlinkSync(path.join(backupDir, f))
        })
      }

      return { ok: true, path: backupPath }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('backup:list', () => {
    try {
      const backupDir = getBackupDir()
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('trucks_') && f.endsWith('.db'))
        .sort()
        .reverse()
        .map(f => ({
          name: f,
          path: path.join(backupDir, f),
          size: fs.statSync(path.join(backupDir, f)).size,
          date: f.replace('trucks_', '').replace('.db', ''),
        }))
      return { ok: true, files }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('backup:restore', (_e, fileName: string) => {
    try {
      const backupPath = path.join(getBackupDir(), fileName)
      const dbPath = getDbPath()
      if (!fs.existsSync(backupPath)) return { ok: false, error: 'Файл не найден' }
      // Создаём резерв текущей БД перед восстановлением
      fs.copyFileSync(dbPath, dbPath + '.before_restore')
      fs.copyFileSync(backupPath, dbPath)
      return { ok: true, message: 'База восстановлена. Перезапустите приложение.' }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
}

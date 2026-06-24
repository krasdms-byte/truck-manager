import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { initDatabase } from './database/db'
import { registerIncomeHandlers }    from './ipc/income'
import { registerTripsHandlers }     from './ipc/trips'
import { registerEmployeesHandlers } from './ipc/employees'
import { registerExpensesHandlers, registerPartsHandlers, registerPartsReceiptsHandlers } from './ipc/expenses'
import { registerReportHandlers }    from './ipc/reports'
import { registerAuthHandlers }      from './ipc/auth'
import { registerBackupHandlers }    from './ipc/backup'
import { registerProjectsHandlers }  from './ipc/projects'
import { registerDictionaryHandlers } from './ipc/dictionaries'
import { registerAuditHandlers }      from './ipc/audit'
import { registerAccommodationHandlers } from './ipc/accommodation'
import { registerOrganizationsHandlers } from './ipc/organizations'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1280,
    minHeight: 768,
    titleBarStyle: 'hiddenInset', // Нативный Mac look
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false, // Показываем после загрузки чтобы не мигало
  })

  // Загружаем UI
  if (isDev) {
    mainWindow.loadURL('http://localhost:5175')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Инициализация БД при старте
  try {
    await initDatabase()
    console.log('✅ Database initialized')
  } catch (err) {
    console.error('❌ Database init failed:', err)
    dialog.showErrorBox('Ошибка базы данных', `Не удалось инициализировать базу данных:\n${err}`)
    app.quit()
    return
  }

  // Регистрируем все IPC обработчики
  registerAuthHandlers()
  registerIncomeHandlers()
  registerTripsHandlers()
  registerEmployeesHandlers()
  registerExpensesHandlers()
  registerPartsHandlers()
  registerPartsReceiptsHandlers()
  registerReportHandlers()
  registerBackupHandlers()
  registerProjectsHandlers()
  registerDictionaryHandlers()
  registerAuditHandlers()
  registerAccommodationHandlers()
  registerOrganizationsHandlers()

  // Хранение настроек приложения
  const Store = require('electron').app
  let appSettings: any = {}
  try {
    const fs = require('fs')
    const settingsPath = require('path').join(app.getPath('userData'), 'settings.json')
    if (fs.existsSync(settingsPath)) appSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {}

  function saveSettings() {
    const fs = require('fs')
    const settingsPath = require('path').join(app.getPath('userData'), 'settings.json')
    fs.writeFileSync(settingsPath, JSON.stringify(appSettings))
  }

  ipcMain.handle('settings:get', (_e, key: string) => appSettings[key] ?? null)
  ipcMain.handle('settings:set', (_e, key: string, value: any) => { appSettings[key] = value; saveSettings(); return { ok: true } })

  // Claude API — распознавание документов
  const https = require('https')
  ipcMain.handle('claude:recognize', async (_e, base64: string, mediaType: string) => {
    const apiKey = appSettings['anthropic_api_key'] || ''
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: mediaType || 'application/pdf', data: base64 } },
        { type: 'text', text: 'Это УПД (универсальный передаточный документ) или счёт-фактура.\n\nПравила извлечения данных:\n1. ПРОДАВЕЦ — поле (2) документа. ИНН продавца — поле (2б). НЕ путать с покупателем (поле 6).\n2. Таблица товаров:\n   - наименование: столбец (1а)\n   - количество: столбец (3). Формат X,000 означает целое число X. Например 1,000=1, 2,000=2, 10,000=10.\n   - цена за единицу = столбец (9) \'Стоимость товаров с налогом всего\' делить на количество\n   - единица: столбец (2а)\n3. Все суммы в рублях — пробел это разделитель разрядов (1 900,00 = 1900), запятая — копейки.\n\nВерни ТОЛЬКО JSON без markdown и пояснений:\n{"supplier":{"name":"название продавца кратко","inn":"ИНН продавца только цифры"},"items":[{"name":"наименование товара","qty":1,"price_per_unit":0,"unit":"шт"}]}' }
      ]}]
    })
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey as string, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) }
      }, (res: any) => {
        let data = ''
        res.on('data', (chunk: any) => data += chunk)
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch(e) { reject(e) } })
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})


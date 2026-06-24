import { useState, useEffect } from 'react'

const api = () => window.api

interface BackupFile {
  name: string
  path: string
  size: number
  date: string
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SettingsPage() {
  const [backups, setBackups]         = useState<BackupFile[]>([])
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [backupMsg, setBackupMsg]     = useState<{ ok: boolean; text: string } | null>(null)
  const [restoreMsg, setRestoreMsg]   = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)

  useEffect(() => { loadBackups() }, [])

  async function loadBackups() {
    try {
      const res = await api().backup.list()
      if (res.ok) setBackups(res.files)
    } catch {}
  }

  async function handleCreateBackup() {
    setLoadingBackup(true)
    setBackupMsg(null)
    try {
      const res = await api().backup.create()
      if (res.ok) {
        setBackupMsg({ ok: true, text: `Бэкап создан: ${res.path.split('/').pop()}` })
        loadBackups()
      } else {
        setBackupMsg({ ok: false, text: res.error })
      }
    } catch (e: any) {
      setBackupMsg({ ok: false, text: e.message })
    } finally {
      setLoadingBackup(false)
    }
  }

  async function handleRestore(fileName: string) {
    setRestoreMsg(null)
    try {
      const res = await api().backup.restore(fileName)
      if (res.ok) {
        setRestoreMsg({ ok: true, text: 'База восстановлена. Перезапустите приложение.' })
      } else {
        setRestoreMsg({ ok: false, text: res.error })
      }
    } catch (e: any) {
      setRestoreMsg({ ok: false, text: e.message })
    } finally {
      setConfirmRestore(null)
    }
  }

  return (
    <>
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Настройки</h1>
        <p className="text-sm text-slate-500">Управление данными и резервными копиями</p>
      </div>

      {/* ─── БЭКАП ─────────────────────────────────────────────────── */}
      <div className="card card-body space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-700">Резервные копии</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Сохраняются в ~/Documents/TruckManager/backups · хранится до 30 копий
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={handleCreateBackup}
            disabled={loadingBackup}
          >
            {loadingBackup ? '⏳ Создание...' : '💾 Создать бэкап'}
          </button>
        </div>

        {backupMsg && (
          <div className={`text-sm px-3 py-2 rounded ${backupMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {backupMsg.text}
          </div>
        )}

        {restoreMsg && (
          <div className={`text-sm px-3 py-2 rounded ${restoreMsg.ok ? 'bg-blue-50 text-blue-700 font-medium' : 'bg-red-50 text-red-700'}`}>
            {restoreMsg.text}
          </div>
        )}

        {/* Список бэкапов */}
        {backups.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Резервных копий пока нет</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Файл</th>
                  <th className="text-right">Размер</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backups.map(b => (
                  <tr key={b.name}>
                    <td className="text-sm text-slate-600">{b.date}</td>
                    <td className="text-xs text-slate-400 font-mono">{b.name}</td>
                    <td className="text-right text-xs text-slate-400">{formatSize(b.size)}</td>
                    <td>
                      {confirmRestore === b.name ? (
                        <div className="flex gap-2 justify-end items-center">
                          <span className="text-xs text-red-600">Восстановить из этой копии?</span>
                          <button
                            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                            onClick={() => handleRestore(b.name)}
                          >Да</button>
                          <button
                            className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                            onClick={() => setConfirmRestore(null)}
                          >Нет</button>
                        </div>
                      ) : (
                        <button
                          className="text-slate-400 hover:text-blue-600 text-xs px-2 py-1 rounded hover:bg-blue-50"
                          onClick={() => setConfirmRestore(b.name)}
                        >↩ Восстановить</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── О ПРОГРАММЕ ───────────────────────────────────────────── */}
      <div className="card card-body space-y-3">
        <h2 className="font-semibold text-slate-700">О программе</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-slate-400">Название</div>
          <div className="text-slate-700 font-medium">Truck Manager</div>
          <div className="text-slate-400">Версия</div>
          <div className="text-slate-700">1.0.0</div>
          <div className="text-slate-400">База данных</div>
          <div className="text-slate-600 font-mono text-xs">~/Documents/TruckManager/trucks.db</div>
          <div className="text-slate-400">Бэкапы</div>
          <div className="text-slate-600 font-mono text-xs">~/Documents/TruckManager/backups/</div>
        </div>
      </div>
    </div>
      <ClaudeApiSection />
    </>
  )
}

function ClaudeApiSection() {
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.api.settings.get('anthropic_api_key').then((k: string) => {
      if (k) { setApiKey(k); setLoaded(true) }
    })
  }, [])

  async function handleSave() {
    await window.api.settings.set('anthropic_api_key', apiKey.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="card card-body space-y-3">
      <div>
        <h3 className="font-semibold text-slate-700">🤖 Claude API</h3>
        <p className="text-xs text-slate-400 mt-0.5">Используется для распознавания счётов и УПД в разделе Склад</p>
      </div>
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="label">Anthropic API ключ</label>
          <input
            type="password"
            className="input font-mono text-sm"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={handleSave}>
          {saved ? '✓ Сохранено' : 'Сохранить'}
        </button>
      </div>
      {loaded && <p className="text-xs text-green-600">✓ Ключ сохранён</p>}
      <p className="text-xs text-slate-400">
        Получить ключ: <span className="font-mono">console.anthropic.com</span>
      </p>
    </div>
  )
}
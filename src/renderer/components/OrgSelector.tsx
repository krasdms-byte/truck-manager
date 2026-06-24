import { useState, useEffect } from 'react'

const api = () => window.api

interface Org { id: number; name: string; inn?: string; type: string }

interface OrgSelectorProps {
  value: string           // текущее значение (название или id)
  onChange: (name: string, orgId?: number) => void
  placeholder?: string
  label?: string
}

async function lookupInn(inn: string): Promise<string | null> {
  if (!inn || inn.replace(/\D/g, '').length < 10) return null
  try {
    const r = await window.api.organizations.lookupInn(inn)
    if (r?.ok && r.name) return r.name
  } catch {}
  return null
}

export function OrgSelector({ value, onChange, placeholder = '— не указана —', label }: OrgSelectorProps) {
  const [orgs, setOrgs]             = useState<Org[]>([])
  const [showModal, setShowModal]   = useState(false)
  const [newForm, setNewForm]       = useState({ name: '', inn: '', type: 'both' })
  const [innLoading, setInnLoading] = useState(false)
  const [saving, setSaving]         = useState(false)

  useEffect(() => { loadOrgs() }, [])

  function loadOrgs() {
    api().organizations.getAll().then(setOrgs).catch(() => {})
  }

  async function handleInnBlur(inn: string) {
    if (!inn || inn.replace(/\D/g, '').length < 10) return
    setInnLoading(true)
    const name = await lookupInn(inn)
    if (name) setNewForm(f => ({ ...f, name }))
    setInnLoading(false)
  }

  async function handleLookupClick() {
    if (!newForm.inn) return
    setInnLoading(true)
    const name = await lookupInn(newForm.inn)
    if (name) setNewForm(f => ({ ...f, name }))
    else alert('Организация не найдена по ИНН. Введите название вручную.')
    setInnLoading(false)
  }

  async function handleSave() {
    if (!newForm.name.trim()) return
    setSaving(true)
    try {
      const r = await api().organizations.create(newForm)
      if (r.ok) {
        await loadOrgs()
        onChange(newForm.name, r.id)
        setShowModal(false)
        setNewForm({ name: '', inn: '', type: 'both' })
      }
    } finally {
      setSaving(false)
    }
  }

  const selectedOrg = orgs.find(o => o.name === value || String(o.id) === value)

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">{label}</label>
          <button type="button" onClick={() => setShowModal(true)}
            className="text-xs text-primary-600 hover:text-primary-700 hover:underline">
            + Новая организация
          </button>
        </div>
      )}

      <select
        className="input"
        value={selectedOrg ? selectedOrg.name : value}
        onChange={e => {
          const org = orgs.find(o => o.name === e.target.value)
          onChange(e.target.value, org?.id)
        }}
      >
        <option value="">{placeholder}</option>
        {orgs.map(o => (
          <option key={o.id} value={o.name}>
            {o.name}{o.inn ? ` (${o.inn})` : ''}
          </option>
        ))}
      </select>

      {!label && (
        <button type="button" onClick={() => setShowModal(true)}
          className="text-xs text-primary-600 hover:underline mt-1 block">
          + Новая организация
        </button>
      )}

      {/* Модальное окно создания */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 text-lg">Новая организация</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">ИНН</label>
                  {newForm.inn && (
                    <button onClick={handleLookupClick}
                      className="text-xs text-primary-600 hover:underline">
                      {innLoading ? '🔍 поиск...' : '🔍 Найти по ИНН'}
                    </button>
                  )}
                </div>
                <input
                  className="input"
                  placeholder="7701234567 (10 или 12 цифр)"
                  value={newForm.inn}
                  onChange={e => setNewForm({...newForm, inn: e.target.value})}
                  onBlur={e => handleInnBlur(e.target.value)}
                />
                {innLoading && <p className="text-xs text-slate-400 mt-1">🔍 Поиск в реестре ФНС...</p>}
              </div>

              <div>
                <label className="label">Название *</label>
                <input
                  className="input"
                  placeholder="ООО Ромашка"
                  value={newForm.name}
                  onChange={e => setNewForm({...newForm, name: e.target.value})}
                  autoFocus={!newForm.inn}
                />
              </div>

              <div>
                <label className="label">Тип</label>
                <select className="input" value={newForm.type}
                  onChange={e => setNewForm({...newForm, type: e.target.value})}>
                  <option value="both">Поставщик и клиент</option>
                  <option value="supplier">Поставщик</option>
                  <option value="client">Клиент</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="btn-primary flex-1" onClick={handleSave} disabled={saving || !newForm.name.trim()}>
                {saving ? 'Сохранение...' : '✓ Сохранить и выбрать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

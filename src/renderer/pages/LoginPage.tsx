import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export function LoginPage() {
  const { login } = useAuthStore()
  const navigate  = useNavigate()

  useEffect(() => {
    login('admin', 'admin123').then(r => { if (r.ok) navigate('/') })
  }, [])

  return (
    <div className="h-screen flex items-center justify-center bg-slate-100">
      <div className="text-slate-400 text-sm">Вход...</div>
    </div>
  )
}

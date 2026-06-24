import { create } from 'zustand'

interface User {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'operator'
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  verify: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,

  login: async (username, password) => {
    const result = await window.api.auth.login({ username, password })
    if (result.ok) {
      // Сохраняем токен в sessionStorage (не localStorage — безопаснее)
      sessionStorage.setItem('token', result.token)
      set({ user: result.user, token: result.token })
    }
    return result
  },

  logout: () => {
    sessionStorage.removeItem('token')
    set({ user: null, token: null })
  },

  verify: async () => {
    const token = sessionStorage.getItem('token')
    if (!token) { set({ isLoading: false }); return }
    const result = await window.api.auth.verify(token)
    if (result.ok) {
      set({ user: result.user, token, isLoading: false })
    } else {
      sessionStorage.removeItem('token')
      set({ user: null, token: null, isLoading: false })
    }
  },
}))

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { User } from '@shared/types'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const TOKEN_KEY = 'tm_token'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,  setUser]  = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Проверяем сохранённый токен при старте
  useEffect(() => {
    const savedToken = sessionStorage.getItem(TOKEN_KEY)
    if (savedToken) {
      window.api.auth.verify(savedToken).then((res: any) => {
        if (res.ok) {
          setToken(savedToken)
          setUser(res.user)
        } else {
          sessionStorage.removeItem(TOKEN_KEY)
        }
        setIsLoading(false)
      })
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await window.api.auth.login({ username, password }) as any
    if (res.ok) {
      setToken(res.token)
      setUser(res.user)
      sessionStorage.setItem(TOKEN_KEY, res.token)
    }
    return res
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    sessionStorage.removeItem(TOKEN_KEY)
    window.api.auth.logout()
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

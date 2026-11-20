import { createContext, useContext } from 'react'

export interface AdminSession {
  userId: number
  role: string
  displayName: string
  email: string
}

export const AdminSessionContext = createContext<AdminSession | null>(null)

export function useAdminSession(): AdminSession {
  const session = useContext(AdminSessionContext)
  if (!session) throw new Error('useAdminSession must be used inside the admin gate')
  return session
}

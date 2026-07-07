// app/(protected)/layout.tsx
import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <AppShell userEmail={user.email}>
      {children}
    </AppShell>
  )
}
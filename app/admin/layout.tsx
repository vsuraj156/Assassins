import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/lib/auth'

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/game', label: 'Game Control' },
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/admin/teams', label: 'Teams' },
  { href: '/admin/players', label: 'Players' },
  { href: '/admin/eliminations', label: 'Kills' },
  { href: '/admin/checkins', label: 'Check-ins' },
  { href: '/admin/wars', label: 'Wars' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') redirect('/')

  return (
    <div className="min-h-screen bg-black">
      <nav className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-red-500 font-bold text-sm mr-3">ADMIN</span>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/' })
            }}
          >
            <button className="text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}

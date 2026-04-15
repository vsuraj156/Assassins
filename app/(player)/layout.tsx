import { auth, signOut, isMultiProfileEmail } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const navItems = [
  { href: '/dashboard', label: 'Status' },
  { href: '/target', label: 'My Target' },
  { href: '/checkin', label: 'Check In' },
  { href: '/elimination', label: 'Report Kill' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/log', label: 'Kill Log' },
  { href: '/rules', label: 'Rules' },
]

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (!session.user.playerId) redirect('/signup/create-team')

  const showProfileSwitcher = session.user.email ? isMultiProfileEmail(session.user.email) : false

  return (
    <div className="min-h-screen bg-black">
      <nav className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-1 flex-wrap">
            <Link href="/dashboard" className="text-red-500 font-bold text-sm mr-3">QA</Link>
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
          <div className="flex items-center gap-2">
            {showProfileSwitcher && (
              <Link
                href="/switch-profile"
                className="text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1"
              >
                Switch Profile
              </Link>
            )}
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
        </div>
      </nav>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  )
}

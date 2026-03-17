import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/lib/auth'

export default async function SignupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/')

  return (
    <div className="min-h-screen bg-black">
      <nav className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <Link href="/" className="text-red-500 font-bold text-sm">Quincy Assassins</Link>
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }) }}>
            <button className="text-xs text-zinc-500 hover:text-white">Sign out</button>
          </form>
        </div>
      </nav>
      <main className="mx-auto max-w-2xl px-4 py-12">{children}</main>
    </div>
  )
}

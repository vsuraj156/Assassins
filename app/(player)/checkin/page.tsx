import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { redirect } from 'next/navigation'
import CheckinClient from './CheckinClient'

export default async function CheckinPage() {
  const session = await auth()
  if (!session?.user?.gameId) redirect('/')

  const db = createServerClient()
  const { data: game } = await db.from('games').select('status').eq('id', session.user.gameId).single()

  if (game?.status !== 'active') {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Daily Check-in</h1>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <p className="text-zinc-400 font-medium">Game hasn&apos;t started yet.</p>
          <p className="text-zinc-600 text-sm mt-1">Check-ins open once the game is active.</p>
        </div>
      </div>
    )
  }

  return <CheckinClient />
}

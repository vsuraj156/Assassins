import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { redirect } from 'next/navigation'
import EliminationClient from './EliminationClient'

export default async function EliminationPage() {
  const session = await auth()
  if (!session?.user?.gameId) redirect('/')

  const db = createServerClient()
  const { data: game } = await db.from('games').select('status').eq('id', session.user.gameId).single()

  if (game?.status !== 'active') {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Report a Kill</h1>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <p className="text-zinc-400 font-medium">Game hasn&apos;t started yet.</p>
          <p className="text-zinc-600 text-sm mt-1">Kill reporting opens once the game is active.</p>
        </div>
      </div>
    )
  }

  return <EliminationClient />
}

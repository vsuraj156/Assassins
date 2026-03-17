import { createServerClient } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function KillLogPage() {
  const session = await auth()
  const db = createServerClient()

  const gameId = session?.user?.gameId
  if (!gameId) return <div className="text-zinc-500">No active game.</div>

  // Get game's blackout hours
  const { data: game } = await db.from('games').select('kill_blackout_hours').eq('id', gameId).single()
  const blackoutHours = game?.kill_blackout_hours ?? 48

  // Only show kills approved more than blackout_hours ago
  const cutoff = new Date(Date.now() - blackoutHours * 60 * 60 * 1000).toISOString()

  const { data: eliminations } = await db
    .from('eliminations')
    .select(`
      id, points, is_double_0, approved_at, timestamp,
      killer:players!killer_id(name),
      target:players!target_id(name),
      killer_team:teams!killer_team_id(name),
      target_team:teams!target_team_id(name)
    `)
    .eq('game_id', gameId)
    .eq('status', 'approved')
    .lt('approved_at', cutoff)
    .order('approved_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Kill Log</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Kills are hidden for {blackoutHours} hours after confirmation.
        </p>
      </div>

      {!eliminations?.length ? (
        <p className="text-center py-12 text-zinc-500">No kills to show yet.</p>
      ) : (
        <div className="space-y-2">
          {eliminations.map((e) => (
            <div key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-400">{(e.killer as unknown as { name: string } | null)?.name}</span>
                  <span className="text-zinc-600 text-xs">({(e.killer_team as unknown as { name: string } | null)?.name})</span>
                  <span className="text-red-500">✕</span>
                  <span className="text-white font-semibold">{(e.target as unknown as { name: string } | null)?.name}</span>
                  <span className="text-zinc-600 text-xs">({(e.target_team as unknown as { name: string } | null)?.name})</span>
                  {e.is_double_0 && <span className="text-yellow-400 text-xs font-bold">DOUBLE-0</span>}
                </div>
                <div className="text-right">
                  <span className="text-white font-bold">+{e.points}</span>
                  <div className="text-zinc-600 text-xs">{new Date(e.approved_at!).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

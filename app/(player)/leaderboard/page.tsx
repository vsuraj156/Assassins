import { createServerClient } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const session = await auth()
  const db = createServerClient()

  const gameId = session?.user?.gameId
  if (!gameId) return <div className="text-zinc-500">No active game.</div>

  const { data: teams } = await db
    .from('teams')
    .select('*, players(id, name, status, is_double_0)')
    .eq('game_id', gameId)
    .order('points', { ascending: false })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Leaderboard</h1>

      <div className="space-y-3">
        {teams?.map((team, index) => {
          const activeCount = team.players?.filter((p: { status: string }) => p.status !== 'terminated').length ?? 0
          const totalCount = team.players?.length ?? 0
          return (
            <div
              key={team.id}
              className={`rounded-xl border p-5 ${
                team.status === 'eliminated' ? 'border-zinc-800 bg-zinc-950 opacity-50' :
                index === 0 ? 'border-yellow-700 bg-yellow-950/10' :
                'border-zinc-800 bg-zinc-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-2xl font-bold ${index === 0 ? 'text-yellow-400' : 'text-zinc-600'}`}>
                    #{index + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-white text-lg">{team.name}</div>
                    <div className="text-xs text-zinc-500">
                      {activeCount}/{totalCount} agents active
                      {team.status === 'eliminated' && <span className="ml-2 text-red-400">ELIMINATED</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-white">{team.points}</div>
                  <div className="text-xs text-zinc-500">points</div>
                </div>
              </div>

              {team.players && team.players.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {team.players.map((p: { id: string; name: string; status: string; is_double_0: boolean }) => (
                    <span
                      key={p.id}
                      className={`text-xs px-2 py-0.5 rounded border ${
                        p.status === 'terminated' ? 'border-zinc-800 text-zinc-600 line-through' :
                        p.status === 'exposed' ? 'border-yellow-900 text-yellow-400' :
                        p.status === 'wanted' ? 'border-orange-900 text-orange-400' :
                        'border-zinc-700 text-zinc-300'
                      }`}
                    >
                      {p.name}{p.is_double_0 ? ' (00)' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

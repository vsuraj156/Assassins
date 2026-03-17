import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import Image from 'next/image'

export const dynamic = 'force-dynamic'

const statusColor: Record<string, string> = {
  active: 'text-green-400',
  exposed: 'text-yellow-400',
  wanted: 'text-orange-400',
  terminated: 'text-red-400',
  amnesty: 'text-blue-400',
}

export default async function TargetPage() {
  const session = await auth()
  if (!session?.user?.teamId) return <div className="text-zinc-500">No team assigned.</div>

  const db = createServerClient()

  // Get this team's target — server-side only
  const { data: myTeam } = await db
    .from('teams')
    .select('target_team_id')
    .eq('id', session.user.teamId)
    .single()

  if (!myTeam?.target_team_id) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p>No target assigned yet. Check back when the game starts.</p>
      </div>
    )
  }

  const [{ data: targetTeam }, { data: targetPlayers }] = await Promise.all([
    db.from('teams').select('id, name, status, points').eq('id', myTeam.target_team_id).single(),
    db.from('players').select('id, name, photo_url, status, is_double_0, code_name, code_name_status').eq('team_id', myTeam.target_team_id),
  ])

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Your Target</h1>
        <p className="text-zinc-400 text-sm mt-1">This page is only visible to you. Keep it confidential.</p>
      </div>

      <div className="rounded-xl border border-red-900 bg-red-950/10 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">{targetTeam?.name}</h2>
          <span className={`text-xs px-2 py-1 rounded-full ${targetTeam?.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
            {targetTeam?.status}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {targetPlayers?.map((player) => (
            <div
              key={player.id}
              className={`rounded-lg border p-4 ${player.status === 'terminated' ? 'border-zinc-800 opacity-40' : 'border-zinc-700 bg-zinc-900'}`}
            >
              {player.photo_url ? (
                <div className="relative h-32 w-full rounded-lg overflow-hidden mb-3 bg-zinc-800">
                  <Image src={player.photo_url} alt={player.name} fill className="object-cover" unoptimized />
                </div>
              ) : (
                <div className="h-32 w-full rounded-lg bg-zinc-800 flex items-center justify-center mb-3 text-zinc-600 text-4xl">?</div>
              )}
              <div>
                <div className="font-semibold text-white">{player.name}</div>
                {player.code_name_status === 'approved' && player.code_name && (
                  <div className="text-zinc-400 text-xs italic">"{player.code_name}"</div>
                )}
                <div className={`text-xs mt-1 font-medium ${statusColor[player.status] ?? 'text-zinc-400'}`}>
                  {player.status}
                </div>
                {player.is_double_0 && <div className="text-yellow-400 text-xs">Double-0</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-zinc-500">
          To report a kill, go to <a href="/elimination" className="text-zinc-300 underline">Report Kill</a>.
          Remember: you must physically eliminate your target — no remote kills.
        </p>
      </div>
    </div>
  )
}

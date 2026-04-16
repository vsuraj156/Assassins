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

type Player = {
  id: string
  name: string
  photo_url: string | null
  status: string
  is_double_0: boolean
  code_name: string | null
  code_name_status: string
}

function PlayerCard({ player }: { player: Player }) {
  return (
    <div className={`rounded-lg border p-4 ${player.status === 'terminated' ? 'border-zinc-800 opacity-40' : 'border-zinc-700 bg-zinc-900'}`}>
      {player.photo_url ? (
        <div className="relative h-32 w-full rounded-lg overflow-hidden mb-3 bg-zinc-800">
          <Image src={player.photo_url} alt={player.name} fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="h-32 w-full rounded-lg bg-zinc-800 flex items-center justify-center mb-3 text-zinc-600 text-4xl">?</div>
      )}
      <div className="font-semibold text-white">{player.name}</div>
      {player.code_name_status === 'approved' && player.code_name && (
        <div className="text-zinc-400 text-xs italic">"{player.code_name}"</div>
      )}
      <div className={`text-xs mt-1 font-medium ${statusColor[player.status] ?? 'text-zinc-400'}`}>
        {player.status}
      </div>
      {player.is_double_0 && <div className="text-yellow-400 text-xs">Double-0</div>}
    </div>
  )
}

export default async function TargetPage() {
  const session = await auth()
  if (!session?.user?.teamId) return <div className="text-zinc-500">No team assigned.</div>

  const db = createServerClient()

  const { data: myTeam } = await db
    .from('teams')
    .select('target_team_id')
    .eq('id', session.user.teamId)
    .single()

  const { data: currentPlayer } = await db
    .from('players')
    .select('is_double_0')
    .eq('id', session.user.playerId!)
    .single()

  if (!myTeam?.target_team_id) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p>No target assigned yet. Check back when the game starts.</p>
      </div>
    )
  }

  // Fetch assigned target + active wars in parallel
  const [{ data: targetTeam }, { data: targetPlayers }, { data: wars }] = await Promise.all([
    db.from('teams').select('id, name, status, points').eq('id', myTeam.target_team_id).single(),
    db.from('players')
      .select('id, name, photo_url, status, is_double_0, code_name, code_name_status')
      .eq('team_id', myTeam.target_team_id)
      .not('status', 'eq', 'terminated'),
    db.from('wars')
      .select('team1_id, team2_id')
      .eq('game_id', session.user.gameId!)
      .eq('status', 'active'),
  ])

  // War targets — teams we're at war with, excluding our assigned target
  const warTeamIds = [...new Set(
    (wars ?? [])
      .flatMap((w) => [w.team1_id, w.team2_id])
      .filter((id) => id !== session.user.teamId && id !== myTeam.target_team_id)
  )]

  const warTargets: { teamName: string; players: Player[] }[] = []
  for (const teamId of warTeamIds) {
    const [{ data: wTeam }, { data: wPlayers }] = await Promise.all([
      db.from('teams').select('name').eq('id', teamId).single(),
      db.from('players')
        .select('id, name, photo_url, status, is_double_0, code_name, code_name_status')
        .eq('team_id', teamId)
        .not('status', 'eq', 'terminated'),
    ])
    if (wTeam && wPlayers?.length) {
      warTargets.push({ teamName: wTeam.name, players: wPlayers as Player[] })
    }
  }

  // Double-0 targets — only if current player is a Double-0
  const alreadyListed = new Set<string>([
    ...(targetPlayers ?? []).map((p) => p.id),
    ...warTargets.flatMap((wt) => wt.players.map((p) => p.id)),
  ])

  let double0Targets: Player[] = []
  if (currentPlayer?.is_double_0) {
    const { data } = await db
      .from('players')
      .select('id, name, photo_url, status, is_double_0, code_name, code_name_status')
      .eq('game_id', session.user.gameId!)
      .eq('is_double_0', true)
      .not('status', 'eq', 'terminated')
      .not('team_id', 'eq', session.user.teamId)
    double0Targets = (data ?? []).filter((p) => p.id !== session.user.playerId && !alreadyListed.has(p.id)) as Player[]
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Your Targets</h1>
        <p className="text-zinc-400 text-sm mt-1">This page is only visible to you. Keep it confidential.</p>
      </div>

      {/* Assigned target */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Assigned Target</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-300">{targetTeam?.name}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(targetPlayers ?? []).map((player) => (
            <PlayerCard key={player.id} player={player as Player} />
          ))}
          {(targetPlayers ?? []).length === 0 && (
            <p className="text-zinc-500 text-sm col-span-2">All players on this team have been eliminated.</p>
          )}
        </div>
      </section>

      {/* War targets */}
      {warTargets.map((wt) => (
        <section key={wt.teamName}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">At War</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/50 text-orange-300">{wt.teamName}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {wt.players.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        </section>
      ))}

      {/* Double-0 targets */}
      {double0Targets.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Double-0 Targets</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-300">00 vs 00</span>
          </div>
          <p className="text-xs text-zinc-500 mb-3">As a Double-0 agent, you may eliminate any other Double-0 regardless of team assignment.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {double0Targets.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        </section>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-zinc-500">
          To report a kill, go to <a href="/elimination" className="text-zinc-300 underline">Report Kill</a>.
          Remember: you must physically eliminate your target — no remote kills.
        </p>
      </div>
    </div>
  )
}

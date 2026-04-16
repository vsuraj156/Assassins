import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import Link from 'next/link'
import TeamRosterCard from './TeamRosterCard'

export const dynamic = 'force-dynamic'

const statusColor: Record<string, string> = {
  active: 'text-green-400 border-green-800',
  exposed: 'text-yellow-400 border-yellow-800',
  wanted: 'text-orange-400 border-orange-800',
  terminated: 'text-red-400 border-red-800',
  amnesty: 'text-blue-400 border-blue-800',
}

const statusMessage: Record<string, string> = {
  active: 'You are in the game. Stay sharp.',
  exposed: 'Your cover is blown. Make a kill or check in to recover.',
  wanted: 'You are wanted. Danger is high.',
  terminated: 'You have been eliminated.',
  amnesty: 'You are under amnesty.',
}

export default async function PlayerDashboard() {
  const session = await auth()
  if (!session?.user?.playerId) return null

  const db = createServerClient()

  const [{ data: player }, { data: stuns }, teamResult, gameResult] = await Promise.all([
    db.from('players').select('*, team:teams(id, name, points, status, target_team_id, last_elimination_at)').eq('id', session.user.playerId).single(),
    db.from('stuns').select('*').eq('stunned_by_id', session.user.playerId).gt('expires_at', new Date().toISOString()),
    session.user.teamId ? db.from('teams').select('*, captain_player_id, players!team_id(id, name, status, is_double_0)').eq('id', session.user.teamId).single() : Promise.resolve({ data: null, error: null }),
    session.user.gameId ? db.from('games').select('name, status, totem_description').eq('id', session.user.gameId).single() : Promise.resolve({ data: null, error: null }),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const { data: todayCheckin } = await db
    .from('checkins')
    .select('status')
    .eq('player_id', session.user.playerId)
    .eq('meal_date', today)
    .single()

  const team = teamResult
  const game = gameResult
  const statusClass = statusColor[player?.status ?? 'active'] ?? 'text-zinc-400 border-zinc-700'

  return (
    <div className="space-y-6">
      {/* Status card */}
      <div className={`rounded-xl border p-6 ${statusClass}`}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{player?.name}</h1>
            {player?.code_name && player.code_name_status === 'approved' && (
              <p className="text-zinc-400 text-sm italic mt-0.5">"{player.code_name}"</p>
            )}
          </div>
          <div className="text-right">
            <span className={`text-2xl font-bold uppercase ${statusClass.split(' ')[0]}`}>{player?.status}</span>
            {player?.is_double_0 && <div className="text-yellow-400 text-xs font-bold mt-1">Double-0 Agent</div>}
            {player?.is_rogue && <div className="text-red-400 text-xs font-bold mt-1">Rogue Agent</div>}
          </div>
        </div>
        <p className="text-sm mt-3 text-zinc-400">{statusMessage[player?.status ?? 'active']}</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/checkin" className={`rounded-xl border p-4 text-center transition-colors hover:bg-zinc-900 ${todayCheckin?.status === 'approved' ? 'border-green-800 bg-green-950/20' : todayCheckin?.status === 'pending' ? 'border-yellow-800' : 'border-red-900 bg-red-950/20'}`}>
          <div className="text-xs text-zinc-400 mb-1">Today's Check-in</div>
          <div className={`text-sm font-semibold ${todayCheckin?.status === 'approved' ? 'text-green-400' : todayCheckin?.status === 'pending' ? 'text-yellow-400' : 'text-red-400'}`}>
            {todayCheckin?.status ?? 'Not submitted'}
          </div>
        </Link>
        <Link href="/target" className="rounded-xl border border-zinc-800 p-4 text-center hover:bg-zinc-900 transition-colors">
          <div className="text-xs text-zinc-400 mb-1">My Target</div>
          <div className="text-sm font-semibold text-white">View →</div>
        </Link>
        <Link href="/elimination" className="rounded-xl border border-zinc-800 p-4 text-center hover:bg-zinc-900 transition-colors">
          <div className="text-xs text-zinc-400 mb-1">Report Kill</div>
          <div className="text-sm font-semibold text-white">Submit →</div>
        </Link>
        <Link href="/leaderboard" className="rounded-xl border border-zinc-800 p-4 text-center hover:bg-zinc-900 transition-colors">
          <div className="text-xs text-zinc-400 mb-1">Leaderboard</div>
          <div className="text-sm font-semibold text-white">View →</div>
        </Link>
      </div>

      {/* Team card */}
      {team.data && (
        <TeamRosterCard
          team={team.data}
          currentPlayerId={session.user.playerId}
          gameStatus={game?.data?.status ?? 'signup'}
        />
      )}

      {/* Active stuns */}
      {(stuns?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-purple-900 bg-purple-950/20 p-4">
          <h3 className="text-sm font-semibold text-purple-300 mb-2">Active Stuns Applied by You</h3>
          {stuns?.map((stun) => (
            <div key={stun.id} className="text-xs text-zinc-400">
              Expires: {new Date(stun.expires_at).toLocaleString()}
            </div>
          ))}
        </div>
      )}

      {/* Totem */}
      {game?.data?.totem_description && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-1">Totem Location</h3>
          <p className="text-sm text-zinc-400">{game.data.totem_description}</p>
        </div>
      )}
    </div>
  )
}

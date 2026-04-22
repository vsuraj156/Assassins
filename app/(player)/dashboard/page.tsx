import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { killTimerResetTime } from '@/lib/game-engine'
import Link from 'next/link'
import KillTimerCard from './KillTimerCard'
import TeamRosterCard from './TeamRosterCard'
import CodeNameResubmitBanner from './CodeNameResubmitBanner'
import PhotoResubmitBanner from './PhotoResubmitBanner'
import TeamNameResubmitBanner from './TeamNameResubmitBanner'
import PlayerNameResubmitBanner from './PlayerNameResubmitBanner'

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

  const now = new Date().toISOString()

  const [{ data: player }, { data: stuns }, teamResult, gameResult, { data: goldenGun }] = await Promise.all([
    db.from('players')
      .select('*, team:teams!team_id(id, name, points, status, target_team_id, last_elimination_at, last_kill_penalty_at)')
      .eq('id', session.user.playerId)
      .single(),
    db.from('stuns')
      .select('*')
      .eq('stunned_by_id', session.user.playerId)
      .gt('expires_at', new Date().toISOString()),
    session.user.teamId
      ? db.from('teams').select('*, captain_player_id, invite_code, name_status, name_rejection_reason, players!team_id(id, name, status, is_double_0)').eq('id', session.user.teamId).single()
      : Promise.resolve({ data: null, error: null }),
    session.user.gameId
      ? db.from('games').select('name, status, totem_description, kill_blackout_hours, general_amnesty_active, start_time').eq('id', session.user.gameId).single()
      : Promise.resolve({ data: null, error: null }),
    db.from('golden_gun_events')
      .select('holder_player_id, expires_at')
      .eq('game_id', session.user.gameId ?? '')
      .eq('status', 'active')
      .gt('expires_at', now)
      .single(),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const teamData = player?.team as {
    id: string; name: string; points: number; status: string
    target_team_id: string | null; last_elimination_at: string | null
    last_kill_penalty_at: string | null
    name_status?: string; name_rejection_reason?: string | null
  } | null

  // Second batch — needs player/team data resolved first
  const [checkinResult, targetTeamResult, higherRankResult, totalTeamsResult] = await Promise.all([
    db.from('checkins').select('status').eq('player_id', session.user.playerId).eq('meal_date', today).single(),
    teamData?.target_team_id
      ? db.from('teams').select('name').eq('id', teamData.target_team_id).single()
      : Promise.resolve({ data: null }),
    session.user.gameId
      ? db.from('teams').select('*', { count: 'exact', head: true }).eq('game_id', session.user.gameId).eq('status', 'active').gt('points', teamData?.points ?? -1)
      : Promise.resolve({ count: null }),
    session.user.gameId
      ? db.from('teams').select('*', { count: 'exact', head: true }).eq('game_id', session.user.gameId).eq('status', 'active')
      : Promise.resolve({ count: null }),
  ])

  const todayCheckin = checkinResult.data
  const targetTeamName = (targetTeamResult as { data: { name: string } | null }).data?.name ?? null
  const teamRank = ((higherRankResult as { count: number | null }).count ?? 0) + 1
  const totalActiveTeams = (totalTeamsResult as { count: number | null }).count ?? 0

  const team = teamResult
  const game = gameResult
  const statusClass = statusColor[player?.status ?? 'active'] ?? 'text-zinc-400 border-zinc-700'

  // Kill timer
  const gameIsActive = game?.data?.status === 'active'
  const teamIsActive = teamData?.status === 'active'
  const playerAlive = player?.status !== 'terminated'
  const killBlackoutHours: number = (game?.data as { kill_blackout_hours?: number } | null)?.kill_blackout_hours ?? 48
  const generalAmnestyActive: boolean = (game?.data as { general_amnesty_active?: boolean } | null)?.general_amnesty_active ?? false
  const showKillTimer = gameIsActive && teamIsActive && playerAlive

  const INITIAL_MS = killBlackoutHours * 60 * 60 * 1000
  const REPEAT_MS = 24 * 60 * 60 * 1000

  let killTimerDeadlineMs: number | null = null
  if (showKillTimer) {
    const rawRef = teamData?.last_elimination_at
      ? killTimerResetTime(new Date(teamData.last_elimination_at)).getTime()
      : (game?.data as { start_time?: string } | null)?.start_time
        ? new Date((game!.data as { start_time: string }).start_time).getTime()
        : null
    if (rawRef !== null) {
      const lastPenaltyMs = teamData?.last_kill_penalty_at
        ? new Date(teamData.last_kill_penalty_at).getTime()
        : null
      const nowMs = Date.now()
      if (nowMs < rawRef + INITIAL_MS) {
        killTimerDeadlineMs = rawRef + INITIAL_MS
      } else if (lastPenaltyMs) {
        killTimerDeadlineMs = lastPenaltyMs + REPEAT_MS
      } else {
        killTimerDeadlineMs = rawRef + INITIAL_MS // already past — shows 0
      }
    }
  }

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

      {/* Team name rejected banner — captain only */}
      {teamData?.name_status === 'rejected' && team?.data && (team.data as { captain_player_id?: string }).captain_player_id === session.user.playerId && (
        <TeamNameResubmitBanner rejectionReason={teamData.name_rejection_reason ?? null} />
      )}

      {/* Player name rejected banner */}
      {player?.name_status === 'rejected' && (
        <PlayerNameResubmitBanner rejectionReason={player.name_rejection_reason ?? null} />
      )}

      {/* Photo rejected banner */}
      {player?.photo_status === 'rejected' && (
        <PhotoResubmitBanner rejectionReason={player.photo_rejection_reason ?? null} />
      )}

      {/* Code name rejected banner */}
      {player?.code_name_status === 'rejected' && (
        <CodeNameResubmitBanner rejectionReason={player.code_name_rejection_reason ?? null} />
      )}

      {/* Golden gun banner */}
      {goldenGun?.holder_player_id === session.user.playerId && (
        <div className="rounded-xl border border-yellow-600 bg-yellow-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-yellow-300 font-semibold text-sm">You hold the Golden Gun</div>
              <div className="text-yellow-600 text-xs mt-0.5">
                You may eliminate any player until{' '}
                {new Date(goldenGun.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
                Return to MI6 before expiry or your kills will be voided and your team exposed.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* General amnesty banner */}
      {generalAmnestyActive && (
        <div className="rounded-xl border border-blue-700 bg-blue-950/30 p-4">
          <div className="text-blue-300 font-semibold text-sm">General Amnesty in Effect</div>
          <div className="text-blue-500 text-xs mt-0.5">
            No kills are permitted until MI6 lifts the amnesty. Check-in penalties are also paused.
          </div>
        </div>
      )}

      {/* Kill timer */}
      {showKillTimer && (
        <KillTimerCard deadlineMs={killTimerDeadlineMs} killWindowHours={killBlackoutHours} />
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {gameIsActive && (
          <Link
            href="/checkin"
            className={`rounded-xl border p-4 text-center transition-colors hover:bg-zinc-900 ${
              todayCheckin?.status === 'approved' ? 'border-green-800 bg-green-950/20' :
              todayCheckin?.status === 'pending'  ? 'border-yellow-800' :
              'border-red-900 bg-red-950/20'
            }`}
          >
            <div className="text-xs text-zinc-400 mb-1">Today's Check-in</div>
            <div className={`text-sm font-semibold ${
              todayCheckin?.status === 'approved' ? 'text-green-400' :
              todayCheckin?.status === 'pending'  ? 'text-yellow-400' :
              'text-red-400'
            }`}>
              {todayCheckin?.status ?? 'Not submitted'}
            </div>
          </Link>
        )}

        <Link href="/target" className="rounded-xl border border-zinc-800 p-4 text-center hover:bg-zinc-900 transition-colors">
          <div className="text-xs text-zinc-400 mb-1">My Target</div>
          <div className="text-sm font-semibold text-white truncate">
            {targetTeamName ?? 'View →'}
          </div>
        </Link>

        <Link href="/elimination" className="rounded-xl border border-zinc-800 p-4 text-center hover:bg-zinc-900 transition-colors">
          <div className="text-xs text-zinc-400 mb-1">Report Kill</div>
          <div className="text-sm font-semibold text-white">Submit →</div>
        </Link>

        <Link href="/leaderboard" className="rounded-xl border border-zinc-800 p-4 text-center hover:bg-zinc-900 transition-colors">
          <div className="text-xs text-zinc-400 mb-1">Leaderboard</div>
          <div className="text-sm font-semibold text-white">
            {totalActiveTeams > 0 ? `#${teamRank} of ${totalActiveTeams}` : 'View →'}
          </div>
        </Link>
      </div>

      {/* Team card */}
      {team.data && (
        <TeamRosterCard
          team={team.data}
          currentPlayerId={session.user.playerId}
          gameStatus={game?.data?.status ?? 'signup'}
          inviteCode={(team.data as { invite_code?: string }).invite_code}
        />
      )}

      {/* Active stuns */}
      {(stuns?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-purple-900 bg-purple-950/20 p-4">
          <h3 className="text-sm font-semibold text-purple-300 mb-2">Active Stuns Applied by You</h3>
          {stuns?.map((stun) => (
            <div key={stun.id} className="text-xs text-zinc-400">
              Expires: {new Date(stun.expires_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
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

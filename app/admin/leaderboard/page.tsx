import { createServerClient } from '@/lib/db'
import { PhotoModal } from '@/components/PhotoModal'

export const dynamic = 'force-dynamic'

const statusColor: Record<string, string> = {
  active: 'text-green-400',
  exposed: 'text-yellow-400',
  wanted: 'text-orange-400',
  terminated: 'text-red-500',
  amnesty: 'text-blue-400',
}

const statusBg: Record<string, string> = {
  active: 'bg-green-950/30',
  exposed: 'bg-yellow-950/20',
  wanted: 'bg-orange-950/20',
  terminated: '',
  amnesty: 'bg-blue-950/30',
}

const teamStatusBg: Record<string, string> = {
  active: 'bg-zinc-900',
  eliminated: 'bg-red-950/60',
  amnesty: 'bg-blue-950/40',
}

export default async function AdminLeaderboardPage() {
  const db = createServerClient()

  const { data: games } = await db.from('games').select('id, name').neq('status', 'ended').limit(1)
  const activeGame = games?.[0]

  if (!activeGame) return <div className="text-zinc-500">No active game.</div>

  const { data: teams } = await db
    .from('teams')
    .select('*, players!team_id(id, name, status, is_double_0, is_rogue, code_name, code_name_status, user_email, photo_url)')
    .eq('game_id', activeGame.id)
    .order('points', { ascending: false })

  if (!teams) return <div className="text-zinc-500">No data.</div>

  type Player = {
    id: string
    name: string
    status: string
    is_double_0: boolean
    is_rogue: boolean
    code_name: string | null
    code_name_status: string
    user_email: string
    photo_url: string | null
  }

  const allPlayers = teams.flatMap((t) => (t.players ?? []) as Player[])
  const teamsRemaining = teams.filter((t) => t.status === 'active').length
  const counts = {
    active: allPlayers.filter((p) => p.status === 'active' && !p.is_rogue).length,
    exposed: allPlayers.filter((p) => p.status === 'exposed').length,
    wanted: allPlayers.filter((p) => p.status === 'wanted').length,
    terminated: allPlayers.filter((p) => p.status === 'terminated').length,
    rogue: allPlayers.filter((p) => p.is_rogue && p.status !== 'terminated').length,
  }
  const totalAlive = counts.active + counts.exposed + counts.wanted + counts.rogue

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Agent Tracker</h1>

      <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
        {[
          { label: 'Teams Remaining', value: teamsRemaining, color: 'text-white' },
          { label: 'Total Alive', value: totalAlive, color: 'text-white' },
          { label: 'Active', value: counts.active, color: 'text-green-400' },
          { label: 'Exposed', value: counts.exposed, color: 'text-yellow-400' },
          { label: 'Wanted', value: counts.wanted, color: 'text-orange-400' },
          { label: 'Eliminated', value: counts.terminated, color: 'text-red-400' },
          { label: 'Rogue', value: counts.rogue, color: 'text-purple-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-xs">
              <th className="text-left px-3 py-2 font-medium">Team</th>
              <th className="text-left px-3 py-2 font-medium w-8"></th>
              <th className="text-left px-3 py-2 font-medium">Agent (00 Agent)</th>
              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Code Name</th>
              <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Email</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => {
              const players = (team.players ?? []) as Player[]
              const isEliminated = team.status === 'eliminated'
              const cellBg = teamStatusBg[team.status] ?? 'bg-zinc-900'
              return players.map((player, pi) => (
                <tr
                  key={player.id}
                  className={`border-t border-zinc-800/50 ${statusBg[player.status] ?? ''}`}
                >
                  {pi === 0 ? (
                    <td
                      rowSpan={players.length}
                      className={`px-3 py-2 align-top font-semibold border-r border-zinc-800 whitespace-nowrap ${cellBg} ${isEliminated ? 'text-zinc-400' : 'text-white'}`}
                    >
                      <div>{team.name}</div>
                      <div className="text-xs font-normal text-zinc-500">
                        {players.length} agent{players.length !== 1 ? 's' : ''} · {team.points} pts
                      </div>
                    </td>
                  ) : null}

                  <td className="px-2 py-1">
                    <PhotoModal src={player.photo_url} name={player.name} terminated={player.status === 'terminated'} />
                  </td>

                  <td className="px-3 py-1.5">
                    <span className={`
                      ${player.is_double_0 ? 'italic font-bold' : ''}
                      ${player.status === 'terminated' ? 'line-through text-zinc-600' : 'text-zinc-200'}
                    `}>
                      {player.name}
                    </span>
                    {player.is_double_0 && (
                      <span className="ml-1.5 text-xs text-yellow-500">00</span>
                    )}
                    {player.is_rogue && (
                      <span className="ml-1.5 text-xs text-purple-400">ROGUE</span>
                    )}
                  </td>

                  <td className="px-3 py-1.5 text-zinc-400 text-xs hidden md:table-cell">
                    {player.code_name_status === 'approved' ? player.code_name : '—'}
                  </td>

                  <td className="px-3 py-1.5 text-zinc-500 text-xs hidden lg:table-cell">
                    {player.user_email}
                  </td>

                  <td className={`px-3 py-1.5 text-xs font-medium uppercase ${statusColor[player.status] ?? 'text-zinc-400'}`}>
                    {player.status}
                  </td>

                  {pi === 0 ? (
                    <td
                      rowSpan={players.length}
                      className="px-3 py-2 text-right align-middle font-bold text-white border-l border-zinc-800"
                    >
                      {team.points}
                    </td>
                  ) : null}
                </tr>
              ))
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

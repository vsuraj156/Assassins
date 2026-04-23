import { createServerClient } from '@/lib/db'
import Link from 'next/link'
import { killTimerResetTime } from '@/lib/game-engine'

export const dynamic = 'force-dynamic'

const INITIAL_WINDOW_MS = 48 * 60 * 60 * 1000
const REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000

const TABS = [
  { id: 'kill-timer', label: 'Kill Timer' },
  { id: 'status', label: 'Status Distribution' },
  { id: 'chain', label: 'Target Chain' },
  { id: 'checkins', label: 'Check-ins' },
]

function computeNextPenaltyAt(referenceMs: number, lastPenaltyMs: number | null): number {
  if (lastPenaltyMs === null || lastPenaltyMs < referenceMs) {
    return referenceMs + INITIAL_WINDOW_MS
  }
  return lastPenaltyMs + REPEAT_WINDOW_MS
}

function formatDuration(ms: number): string {
  if (ms <= 0) return 'OVERDUE'
  const totalMins = Math.floor(ms / 60000)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  return `${hours}h ${mins}m`
}

function urgencyClass(ms: number): string {
  if (ms <= 0) return 'text-red-500 font-bold'
  if (ms < 6 * 60 * 60 * 1000) return 'text-red-400 font-semibold'
  if (ms < 12 * 60 * 60 * 1000) return 'text-orange-400'
  if (ms < 24 * 60 * 60 * 1000) return 'text-yellow-400'
  return 'text-green-400'
}

function formatTs(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York',
  })
}

// ─── Kill Timer Tab ────────────────────────────────────────────────────────────

async function KillTimerTab() {
  const db = createServerClient()
  const now = Date.now()

  const { data: games } = await db
    .from('games')
    .select('id, start_time, general_amnesty_active')
    .eq('status', 'active')
    .limit(1)

  const activeGame = games?.[0]
  if (!activeGame) return <p className="text-zinc-500">No active game.</p>

  const { data: teams } = await db
    .from('teams')
    .select('id, name, last_elimination_at, last_kill_penalty_at, players!team_id(id, status)')
    .eq('game_id', activeGame.id)
    .eq('status', 'active')

  if (!teams?.length) return <p className="text-zinc-500">No active teams.</p>

  const rows = teams
    .map((team) => {
      const referenceMs = team.last_elimination_at
        ? killTimerResetTime(new Date(team.last_elimination_at)).getTime()
        : activeGame.start_time
        ? new Date(activeGame.start_time).getTime()
        : null

      const lastPenaltyMs = team.last_kill_penalty_at
        ? new Date(team.last_kill_penalty_at).getTime()
        : null

      const nextPenaltyAt = referenceMs !== null
        ? computeNextPenaltyAt(referenceMs, lastPenaltyMs)
        : null

      const aliveCount = ((team.players ?? []) as { status: string }[])
        .filter((p) => p.status !== 'terminated').length

      return {
        id: team.id,
        name: team.name,
        last_elimination_at: team.last_elimination_at as string | null,
        referenceMs,
        nextPenaltyAt,
        timeRemaining: nextPenaltyAt !== null ? nextPenaltyAt - now : null,
        aliveCount,
      }
    })
    .sort((a, b) => {
      if (a.timeRemaining === null) return 1
      if (b.timeRemaining === null) return -1
      return a.timeRemaining - b.timeRemaining
    })

  return (
    <div className="space-y-4">
      {activeGame.general_amnesty_active && (
        <div className="rounded-lg bg-blue-950/40 border border-blue-800 px-4 py-3 text-sm text-blue-300">
          General Amnesty is active — kill timers are paused.
        </div>
      )}
      <p className="text-sm text-zinc-400">
        Teams must make a kill every 48 hours or a random agent is penalized. Sorted by urgency.
      </p>
      <div className="rounded-xl border border-zinc-800 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-xs">
              <th className="text-left px-4 py-3 font-medium">Team</th>
              <th className="text-left px-4 py-3 font-medium">Alive</th>
              <th className="text-left px-4 py-3 font-medium">Last Kill</th>
              <th className="text-left px-4 py-3 font-medium">Timer Ref (midnight after kill)</th>
              <th className="text-left px-4 py-3 font-medium">Next Penalty</th>
              <th className="text-left px-4 py-3 font-medium">Time Remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-800/50">
                <td className="px-4 py-3 font-medium text-white">{row.name}</td>
                <td className="px-4 py-3 text-zinc-400">{row.aliveCount}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {row.last_elimination_at
                    ? formatTs(row.last_elimination_at)
                    : <span className="text-zinc-600">None</span>}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {row.referenceMs ? formatTs(new Date(row.referenceMs).toISOString()) : <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {row.nextPenaltyAt ? formatTs(new Date(row.nextPenaltyAt).toISOString()) : <span className="text-zinc-600">—</span>}
                </td>
                <td className={`px-4 py-3 tabular-nums ${row.timeRemaining !== null ? urgencyClass(row.timeRemaining) : 'text-zinc-600'}`}>
                  {row.timeRemaining !== null ? formatDuration(row.timeRemaining) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Status Distribution Tab ───────────────────────────────────────────────────

const statusColor: Record<string, string> = {
  active: 'text-green-400',
  exposed: 'text-yellow-400',
  wanted: 'text-orange-400',
  terminated: 'text-red-500',
  rogue: 'text-purple-400',
}

async function StatusTab() {
  const db = createServerClient()

  const { data: games } = await db
    .from('games')
    .select('id')
    .neq('status', 'ended')
    .limit(1)

  const activeGame = games?.[0]
  if (!activeGame) return <p className="text-zinc-500">No active game.</p>

  const { data: teams } = await db
    .from('teams')
    .select('id, name, status, points, players!team_id(id, status, is_rogue)')
    .eq('game_id', activeGame.id)
    .order('points', { ascending: false })

  if (!teams?.length) return <p className="text-zinc-500">No data.</p>

  type Player = { id: string; status: string; is_rogue: boolean }

  const allPlayers = teams.flatMap((t) => (t.players ?? []) as Player[])
  const counts = {
    active: allPlayers.filter((p) => p.status === 'active' && !p.is_rogue).length,
    exposed: allPlayers.filter((p) => p.status === 'exposed').length,
    wanted: allPlayers.filter((p) => p.status === 'wanted').length,
    terminated: allPlayers.filter((p) => p.status === 'terminated').length,
    rogue: allPlayers.filter((p) => p.is_rogue && p.status !== 'terminated').length,
  }
  const totalAlive = counts.active + counts.exposed + counts.wanted + counts.rogue
  const teamsRemaining = teams.filter((t) => t.status === 'active').length

  const teamRows = teams.map((team) => {
    const players = (team.players ?? []) as Player[]
    return {
      id: team.id,
      name: team.name,
      teamStatus: team.status,
      active: players.filter((p) => p.status === 'active' && !p.is_rogue).length,
      exposed: players.filter((p) => p.status === 'exposed').length,
      wanted: players.filter((p) => p.status === 'wanted').length,
      terminated: players.filter((p) => p.status === 'terminated').length,
      rogue: players.filter((p) => p.is_rogue && p.status !== 'terminated').length,
      totalAlive: players.filter((p) => p.status !== 'terminated').length,
    }
  })

  return (
    <div className="space-y-6">
      {/* Global stat cards */}
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

      {/* Per-team breakdown */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-xs">
              <th className="text-left px-4 py-3 font-medium">Team</th>
              <th className="text-center px-4 py-3 font-medium text-green-500">Active</th>
              <th className="text-center px-4 py-3 font-medium text-yellow-500">Exposed</th>
              <th className="text-center px-4 py-3 font-medium text-orange-500">Wanted</th>
              <th className="text-center px-4 py-3 font-medium text-purple-500">Rogue</th>
              <th className="text-center px-4 py-3 font-medium text-red-500">Eliminated</th>
              <th className="text-center px-4 py-3 font-medium">Alive</th>
            </tr>
          </thead>
          <tbody>
            {teamRows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-zinc-800/50 ${row.teamStatus === 'eliminated' ? 'opacity-50' : ''}`}
              >
                <td className="px-4 py-3 font-medium text-white">
                  {row.name}
                  {row.teamStatus === 'eliminated' && (
                    <span className="ml-2 text-xs text-red-500">eliminated</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-green-400 font-medium">{row.active || '—'}</td>
                <td className="px-4 py-3 text-center text-yellow-400 font-medium">{row.exposed || '—'}</td>
                <td className="px-4 py-3 text-center text-orange-400 font-medium">{row.wanted || '—'}</td>
                <td className="px-4 py-3 text-center text-purple-400 font-medium">{row.rogue || '—'}</td>
                <td className="px-4 py-3 text-center text-red-400 font-medium">{row.terminated || '—'}</td>
                <td className="px-4 py-3 text-center text-zinc-300 font-semibold">{row.totalAlive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Target Chain Tab ──────────────────────────────────────────────────────────

async function ChainTab() {
  const db = createServerClient()

  const { data: games } = await db
    .from('games')
    .select('id')
    .neq('status', 'ended')
    .limit(1)

  const activeGame = games?.[0]
  if (!activeGame) return <p className="text-zinc-500">No active game.</p>

  const { data: teams } = await db
    .from('teams')
    .select('id, name, status, target_team_id, players!team_id(id, status)')
    .eq('game_id', activeGame.id)

  if (!teams?.length) return <p className="text-zinc-500">No teams yet.</p>

  type TeamRow = {
    id: string
    name: string
    status: string
    target_team_id: string | null
    aliveCount: number
  }

  const teamMap = new Map<string, TeamRow>()
  for (const t of teams) {
    teamMap.set(t.id, {
      id: t.id,
      name: t.name,
      status: t.status,
      target_team_id: t.target_team_id as string | null,
      aliveCount: ((t.players ?? []) as { status: string }[]).filter((p) => p.status !== 'terminated').length,
    })
  }

  // Walk the chain starting from first active team with a target
  const activeTeams = [...teamMap.values()].filter((t) => t.status === 'active' && t.target_team_id)
  const chain: TeamRow[] = []

  if (activeTeams.length > 0) {
    const start = activeTeams[0]
    const visited = new Set<string>()
    let current: TeamRow | undefined = start
    while (current && !visited.has(current.id)) {
      chain.push(current)
      visited.add(current.id)
      current = current.target_team_id ? teamMap.get(current.target_team_id) : undefined
    }
  }

  // Teams not in the chain
  const inChain = new Set(chain.map((t) => t.id))
  const orphans = [...teamMap.values()].filter((t) => !inChain.has(t.id))

  const isComplete = chain.length > 0 && chain[chain.length - 1].target_team_id === chain[0].id

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <p className="text-sm text-zinc-400">
          The circular kill chain — each team hunts the next. {chain.length} team{chain.length !== 1 ? 's' : ''} in chain.
        </p>
        {isComplete ? (
          <span className="text-xs bg-green-950 text-green-400 px-2 py-0.5 rounded-full border border-green-900">Chain complete</span>
        ) : chain.length > 0 ? (
          <span className="text-xs bg-red-950 text-red-400 px-2 py-0.5 rounded-full border border-red-900">Chain broken</span>
        ) : null}
      </div>

      {chain.length > 0 && (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 text-zinc-500 text-xs">
                <th className="text-left px-4 py-3 font-medium w-8">#</th>
                <th className="text-left px-4 py-3 font-medium">Hunter</th>
                <th className="px-4 py-3 font-medium text-zinc-700">→</th>
                <th className="text-left px-4 py-3 font-medium">Target</th>
                <th className="text-right px-4 py-3 font-medium">Alive</th>
              </tr>
            </thead>
            <tbody>
              {chain.map((team, i) => {
                const target = team.target_team_id ? teamMap.get(team.target_team_id) : null
                const isEliminated = team.status === 'eliminated'
                return (
                  <tr key={team.id} className={`border-t border-zinc-800/50 ${isEliminated ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 text-zinc-600 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className={isEliminated ? 'line-through text-zinc-500' : 'text-white font-medium'}>
                        {team.name}
                      </span>
                      {isEliminated && <span className="ml-2 text-xs text-red-500">elim.</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-600">→</td>
                    <td className="px-4 py-3">
                      {target ? (
                        <span className={target.status === 'eliminated' ? 'line-through text-zinc-500' : 'text-zinc-300'}>
                          {target.name}
                          {target.status === 'eliminated' && <span className="ml-2 text-xs text-red-500 no-underline">elim.</span>}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">{team.aliveCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {orphans.length > 0 && (
        <div className="rounded-xl border border-zinc-800 p-4 space-y-2">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Teams not in chain</p>
          <div className="flex flex-wrap gap-2">
            {orphans.map((t) => (
              <span key={t.id} className={`text-xs px-2.5 py-1 rounded border ${
                t.status === 'eliminated'
                  ? 'border-red-900 text-red-400 bg-red-950/20'
                  : 'border-zinc-700 text-zinc-400'
              }`}>
                {t.name} {t.status === 'eliminated' ? '(elim.)' : '(no target)'}
              </span>
            ))}
          </div>
        </div>
      )}

      {chain.length === 0 && (
        <p className="text-zinc-500">No target assignments set yet. Assign targets from the Teams page or start the game.</p>
      )}
    </div>
  )
}

// ─── Check-ins Tab ────────────────────────────────────────────────────────────

const mealStatusColor: Record<string, string> = {
  approved: 'text-green-400',
  pending: 'text-yellow-400',
  rejected: 'text-red-400',
}

const mealStatusLabel: Record<string, string> = {
  approved: '✓',
  pending: '…',
  rejected: '✗',
}

async function CheckinsTab({ date }: { date: string }) {
  const db = createServerClient()

  const { data: games } = await db
    .from('games')
    .select('id')
    .neq('status', 'ended')
    .limit(1)

  const activeGame = games?.[0]
  if (!activeGame) return <p className="text-zinc-500">No active game.</p>

  const [{ data: players }, { data: checkins }] = await Promise.all([
    db
      .from('players')
      .select('id, name, status, teams!team_id(id, name)')
      .eq('game_id', activeGame.id)
      .order('name'),
    db
      .from('checkins')
      .select('player_id, meal_time, status')
      .eq('game_id', activeGame.id)
      .eq('meal_date', date),
  ])

  if (!players?.length) return <p className="text-zinc-500">No players yet.</p>

  type MealStatus = 'approved' | 'pending' | 'rejected' | null
  type PlayerRow = {
    id: string
    name: string
    playerStatus: string
    teamName: string
    breakfast: MealStatus
    lunch: MealStatus
    dinner: MealStatus
  }

  const checkinMap = new Map<string, Record<string, string>>()
  for (const c of checkins ?? []) {
    if (!checkinMap.has(c.player_id)) checkinMap.set(c.player_id, {})
    checkinMap.get(c.player_id)![c.meal_time] = c.status
  }

  const rows: PlayerRow[] = players.map((p) => {
    const meals = checkinMap.get(p.id) ?? {}
    const team = Array.isArray(p.teams) ? p.teams[0] : p.teams
    return {
      id: p.id,
      name: p.name,
      playerStatus: p.status,
      teamName: (team as { name: string } | null)?.name ?? '—',
      breakfast: (meals['breakfast'] as MealStatus) ?? null,
      lunch: (meals['lunch'] as MealStatus) ?? null,
      dinner: (meals['dinner'] as MealStatus) ?? null,
    }
  })

  // Sort: alive first, then by team name, then player name
  rows.sort((a, b) => {
    const aAlive = a.playerStatus !== 'terminated' ? 0 : 1
    const bAlive = b.playerStatus !== 'terminated' ? 0 : 1
    if (aAlive !== bAlive) return aAlive - bAlive
    if (a.teamName !== b.teamName) return a.teamName.localeCompare(b.teamName)
    return a.name.localeCompare(b.name)
  })

  const prevDate = new Date(date)
  prevDate.setDate(prevDate.getDate() - 1)
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + 1)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const totalApproved = rows.reduce(
    (sum, r) => sum + [r.breakfast, r.lunch, r.dinner].filter((m) => m === 'approved').length,
    0,
  )
  const totalPending = rows.reduce(
    (sum, r) => sum + [r.breakfast, r.lunch, r.dinner].filter((m) => m === 'pending').length,
    0,
  )

  function MealCell({ status }: { status: MealStatus }) {
    if (!status) return <span className="text-zinc-700">—</span>
    return (
      <span className={`font-semibold ${mealStatusColor[status]}`}>
        {mealStatusLabel[status]}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Date navigation */}
      <div className="flex items-center gap-4">
        <Link
          href={`/admin/health?tab=checkins&date=${fmt(prevDate)}`}
          className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 hover:text-white transition-colors"
        >
          ← Prev
        </Link>
        <span className="text-white font-medium tabular-nums">{date}</span>
        <Link
          href={`/admin/health?tab=checkins&date=${fmt(nextDate)}`}
          className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 hover:text-white transition-colors"
        >
          Next →
        </Link>
        <span className="text-xs text-zinc-500 ml-2">
          {totalApproved} approved · {totalPending} pending
        </span>
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-xs">
              <th className="text-left px-4 py-3 font-medium">Player</th>
              <th className="text-left px-4 py-3 font-medium">Team</th>
              <th className="text-center px-4 py-3 font-medium">Breakfast</th>
              <th className="text-center px-4 py-3 font-medium">Lunch</th>
              <th className="text-center px-4 py-3 font-medium">Dinner</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-zinc-800/50 ${row.playerStatus === 'terminated' ? 'opacity-40' : ''}`}
              >
                <td className="px-4 py-3 font-medium text-white">
                  {row.name}
                  {row.playerStatus === 'terminated' && (
                    <span className="ml-2 text-xs text-red-500 font-normal">elim.</span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400">{row.teamName}</td>
                <td className="px-4 py-3 text-center"><MealCell status={row.breakfast} /></td>
                <td className="px-4 py-3 text-center"><MealCell status={row.lunch} /></td>
                <td className="px-4 py-3 text-center"><MealCell status={row.dinner} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string }>
}) {
  const { tab: rawTab, date: rawDate } = await searchParams
  const tab = TABS.some((t) => t.id === rawTab) ? rawTab! : 'kill-timer'
  const today = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Game Health</h1>

      <div className="flex gap-1 border-b border-zinc-800 pb-0">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/health?tab=${t.id}`}
            className={`px-4 py-2 text-sm transition-colors -mb-px border-b-2 ${
              tab === t.id
                ? 'text-white border-white'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'kill-timer' && <KillTimerTab />}
      {tab === 'status' && <StatusTab />}
      {tab === 'chain' && <ChainTab />}
      {tab === 'checkins' && <CheckinsTab date={date} />}
    </div>
  )
}

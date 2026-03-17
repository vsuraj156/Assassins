'use client'

import { useState, useEffect } from 'react'

interface Player {
  id: string
  name: string
  status: string
  is_double_0: boolean
}

interface Team {
  id: string
  name: string
  status: string
  points: number
  invite_code: string
  name_status: string
  target_team?: { id: string; name: string } | null
  players?: Player[]
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchTeams() }, [])

  async function fetchTeams() {
    const res = await fetch('/api/admin/teams')
    const data = await res.json()
    setTeams(Array.isArray(data) ? data : [])
    setAllTeams(Array.isArray(data) ? data : [])
  }

  async function updateTarget(teamId: string, targetTeamId: string) {
    setLoading(true)
    await fetch('/api/admin/teams', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: teamId, target_team_id: targetTeamId || null }),
    })
    await fetchTeams()
    setLoading(false)
  }

  async function deleteTeam(teamId: string) {
    if (!confirm('Delete this team? This will also delete all associated players.')) return
    await fetch(`/api/admin/teams?team_id=${teamId}`, { method: 'DELETE' })
    await fetchTeams()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Teams</h1>
        <span className="text-sm text-zinc-400">{teams.length} teams</span>
      </div>

      <div className="space-y-4">
        {teams.map((team) => (
          <div key={team.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white text-lg">{team.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    team.name_status === 'approved' ? 'bg-green-900 text-green-300' :
                    team.name_status === 'rejected' ? 'bg-red-900 text-red-300' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>{team.name_status}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    team.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                  }`}>{team.status}</span>
                </div>
                <div className="flex gap-4 mt-1 text-xs text-zinc-500">
                  <span>Code: <span className="font-mono text-zinc-300">{team.invite_code}</span></span>
                  <span>Points: <span className="text-white font-medium">{team.points}</span></span>
                  <span>Members: {team.players?.length ?? 0}/6</span>
                </div>
              </div>
              <button onClick={() => deleteTeam(team.id)} className="text-xs text-zinc-600 hover:text-red-400">Delete</button>
            </div>

            {/* Members */}
            {(team.players?.length ?? 0) > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {team.players?.map((p) => (
                  <span key={p.id} className={`text-xs px-2 py-1 rounded border ${
                    p.status === 'terminated' ? 'border-red-900 text-red-400 bg-red-950/20' :
                    p.status === 'exposed' ? 'border-yellow-900 text-yellow-400' :
                    p.status === 'wanted' ? 'border-orange-900 text-orange-400' :
                    'border-zinc-700 text-zinc-300'
                  }`}>
                    {p.name} {p.is_double_0 ? '(00)' : ''}
                  </span>
                ))}
              </div>
            )}

            {/* Target Assignment */}
            <div className="mt-4 flex items-center gap-3">
              <label className="text-xs text-zinc-400">Target team:</label>
              <select
                className="rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-white"
                value={team.target_team?.id ?? ''}
                onChange={(e) => updateTarget(team.id, e.target.value)}
                disabled={loading}
              >
                <option value="">None</option>
                {allTeams.filter((t) => t.id !== team.id && t.status === 'active').map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {team.target_team && (
                <span className="text-xs text-zinc-400">→ <span className="text-white">{team.target_team.name}</span></span>
              )}
            </div>
          </div>
        ))}
      </div>

      {teams.length === 0 && (
        <p className="text-center text-zinc-500 py-12">No teams yet. Players will create teams using the sign-up flow.</p>
      )}
    </div>
  )
}

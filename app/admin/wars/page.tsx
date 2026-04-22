'use client'

import { useState, useEffect } from 'react'

interface War {
  id: string
  status: string
  reason: string | null
  approved_at: string | null
  ended_at: string | null
  team1?: { id: string; name: string }
  team2?: { id: string; name: string }
  requested_by?: { name: string; user_email: string }
}

interface Team {
  id: string
  name: string
}

export default function AdminWarsPage() {
  const [wars, setWars] = useState<War[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [filter, setFilter] = useState('active')
  const [loading, setLoading] = useState(false)
  const [gameId, setGameId] = useState('')

  // Declare war form state
  const [team1Id, setTeam1Id] = useState('')
  const [team2Id, setTeam2Id] = useState('')
  const [reason, setReason] = useState('')
  const [declareMsg, setDeclareMsg] = useState('')

  useEffect(() => {
    fetchActiveGame()
  }, [])

  useEffect(() => {
    if (gameId) { fetchWars(); fetchTeams() }
  }, [filter, gameId])

  async function fetchActiveGame() {
    const res = await fetch('/api/admin/game')
    const games = await res.json()
    const active = games.find((g: { status: string; id: string }) => g.status === 'active')
    if (active) setGameId(active.id)
  }

  async function fetchWars() {
    const params = new URLSearchParams({ game_id: gameId })
    if (filter) params.set('status', filter)
    const res = await fetch(`/api/admin/wars?${params}`)
    const data = await res.json()
    setWars(Array.isArray(data) ? data : [])
  }

  async function fetchTeams() {
    const res = await fetch(`/api/admin/teams?game_id=${gameId}`)
    const data = await res.json()
    setTeams(Array.isArray(data) ? data.filter((t: Team & { status: string }) => t.status === 'active') : [])
  }

  async function declareWar() {
    if (!team1Id || !team2Id) return
    setLoading(true)
    setDeclareMsg('')
    const res = await fetch('/api/admin/wars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', game_id: gameId, team1_id: team1Id, team2_id: team2Id, reason }),
    })
    const data = await res.json()
    if (!res.ok) setDeclareMsg(`Error: ${data.error}`)
    else {
      setDeclareMsg('War declared!')
      setTeam1Id('')
      setTeam2Id('')
      setReason('')
      fetchWars()
    }
    setLoading(false)
  }

  async function act(warId: string, action: 'approve' | 'end' | 'reject') {
    setLoading(true)
    await fetch('/api/admin/wars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ war_id: warId, action }),
    })
    await fetchWars()
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Wars</h1>

      {/* Declare War */}
      {gameId && (
        <section className="rounded-xl border border-red-900 bg-zinc-950 p-5 space-y-4">
          <h2 className="font-semibold text-white">Declare War</h2>
          <div className="flex gap-3 flex-wrap items-end">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Team 1</label>
              <select
                className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
                value={team1Id}
                onChange={(e) => setTeam1Id(e.target.value)}
              >
                <option value="">Select team...</option>
                {teams.filter((t) => t.id !== team2Id).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <span className="text-red-400 font-bold pb-2">⚔</span>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Team 2</label>
              <select
                className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
                value={team2Id}
                onChange={(e) => setTeam2Id(e.target.value)}
              >
                <option value="">Select team...</option>
                {teams.filter((t) => t.id !== team1Id).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 flex-1 min-w-40">
              <label className="text-xs text-zinc-400">Reason (optional)</label>
              <input
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                placeholder="e.g. Territorial dispute"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <button
              onClick={declareWar}
              disabled={!team1Id || !team2Id || loading}
              className="px-4 py-2 rounded-lg bg-red-800 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Declare War
            </button>
          </div>
          {declareMsg && (
            <p className={`text-sm ${declareMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{declareMsg}</p>
          )}
        </section>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-zinc-300">War History</h2>
        <div className="flex gap-2">
          {['active', 'pending', 'ended', ''].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded text-xs font-medium ${filter === s ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {wars.map((war) => (
          <div key={war.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-white font-semibold">
                  {war.team1?.name} <span className="text-red-400">⚔</span> {war.team2?.name}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  Requested by: {war.requested_by?.name}
                  {war.reason && <span className="ml-2">— {war.reason}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  war.status === 'active' ? 'bg-red-900 text-red-300' :
                  war.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                  'bg-zinc-700 text-zinc-400'
                }`}>{war.status}</span>

                {war.status === 'pending' && (
                  <button onClick={() => act(war.id, 'reject')} disabled={loading} className="px-3 py-1 rounded bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600 disabled:opacity-50">
                    Cancel
                  </button>
                )}
                {war.status === 'active' && (
                  <button onClick={() => act(war.id, 'end')} disabled={loading} className="px-3 py-1 rounded bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600 disabled:opacity-50">
                    End War
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {wars.length === 0 && <p className="text-center text-zinc-500 py-12">No {filter} wars.</p>}
      </div>
    </div>
  )
}

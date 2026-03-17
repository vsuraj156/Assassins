'use client'

import { useState, useEffect } from 'react'

interface Player {
  id: string
  name: string
  user_email: string
  status: string
  role: string
  is_double_0: boolean
  is_rogue: boolean
  code_name: string | null
  code_name_status: string
  team?: { id: string; name: string }
}

const STATUS_OPTIONS = ['active', 'exposed', 'wanted', 'terminated', 'amnesty']
const statusColor: Record<string, string> = {
  active: 'text-green-400',
  exposed: 'text-yellow-400',
  wanted: 'text-orange-400',
  terminated: 'text-red-400',
  amnesty: 'text-blue-400',
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchPlayers() }, [])

  async function fetchPlayers() {
    const res = await fetch('/api/admin/players')
    const data = await res.json()
    setPlayers(Array.isArray(data) ? data : [])
  }

  async function updatePlayer(playerId: string, updates: object) {
    setLoading(true)
    await fetch('/api/admin/players', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId, ...updates }),
    })
    await fetchPlayers()
    setLoading(false)
  }

  async function deletePlayer(playerId: string) {
    if (!confirm('Delete this player?')) return
    await fetch(`/api/admin/players?player_id=${playerId}`, { method: 'DELETE' })
    await fetchPlayers()
  }

  const filtered = players.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.user_email.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || p.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Players</h1>
        <span className="text-sm text-zinc-400">{players.length} total</span>
      </div>

      <div className="flex gap-3">
        <input
          className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 text-xs border-b border-zinc-800">
              <th className="text-left p-3">Player</th>
              <th className="text-left p-3">Team</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Flags</th>
              <th className="text-left p-3">Change Status</th>
              <th className="text-left p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((player) => (
              <tr key={player.id} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3">
                  <div className="text-white font-medium">{player.name}</div>
                  <div className="text-zinc-500 text-xs">{player.user_email}</div>
                  {player.code_name && <div className="text-zinc-400 text-xs italic">"{player.code_name}"</div>}
                </td>
                <td className="p-3 text-zinc-400">{player.team?.name ?? '—'}</td>
                <td className="p-3">
                  <span className={`font-medium ${statusColor[player.status] ?? 'text-zinc-400'}`}>
                    {player.status}
                  </span>
                </td>
                <td className="p-3 text-xs space-y-0.5">
                  {player.is_double_0 && <div className="text-yellow-400">Double-0</div>}
                  {player.is_rogue && <div className="text-red-400">Rogue</div>}
                  {player.role === 'admin' && <div className="text-purple-400">Admin</div>}
                </td>
                <td className="p-3">
                  <select
                    className="rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-white"
                    value={player.status}
                    onChange={(e) => updatePlayer(player.id, { status: e.target.value })}
                    disabled={loading}
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="p-3">
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => updatePlayer(player.id, { is_double_0: !player.is_double_0 })}
                      className="text-xs text-yellow-600 hover:text-yellow-400"
                    >
                      {player.is_double_0 ? 'Un-00' : 'Set 00'}
                    </button>
                    <button
                      onClick={() => updatePlayer(player.id, { is_rogue: !player.is_rogue })}
                      className="text-xs text-red-600 hover:text-red-400"
                    >
                      {player.is_rogue ? 'Un-rogue' : 'Rogue'}
                    </button>
                    <button
                      onClick={() => deletePlayer(player.id)}
                      className="text-xs text-zinc-600 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-6 text-center text-zinc-500 text-sm">No players found.</p>
        )}
      </div>
    </div>
  )
}

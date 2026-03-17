'use client'

import { useState, useEffect } from 'react'

interface PendingTeam {
  id: string
  name: string
  name_status: string
  name_rejection_reason: string | null
}

interface PendingPlayer {
  id: string
  name: string
  code_name: string | null
  code_name_status: string
  code_name_rejection_reason: string | null
  user_email: string
}

export default function ModerationPage() {
  const [teams, setTeams] = useState<PendingTeam[]>([])
  const [players, setPlayers] = useState<PendingPlayer[]>([])
  const [loading, setLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})

  useEffect(() => { fetchPending() }, [])

  async function fetchPending() {
    const res = await fetch('/api/admin/moderation')
    const data = await res.json()
    setTeams(data.teams ?? [])
    setPlayers(data.players ?? [])
  }

  async function act(type: 'team_name' | 'code_name', id: string, action: 'approve' | 'reject') {
    const reason = rejectReason[id] ?? ''
    if (action === 'reject' && !reason.trim()) {
      alert('Please provide a rejection reason.')
      return
    }
    setLoading(true)
    await fetch('/api/admin/moderation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id, action, reason }),
    })
    await fetchPending()
    setLoading(false)
  }

  const pendingCount = teams.filter(t => t.name_status === 'pending').length + players.filter(p => p.code_name_status === 'pending').length

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Name Moderation</h1>
        {pendingCount > 0 && (
          <p className="text-sm text-yellow-400 mt-1">{pendingCount} pending approval{pendingCount > 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Team Names */}
      <section className="space-y-3">
        <h2 className="font-semibold text-zinc-300">Team Names</h2>
        {teams.length === 0 && <p className="text-zinc-500 text-sm">No team names to review.</p>}
        {teams.map((team) => (
          <div key={team.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-white font-semibold text-lg">{team.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                team.name_status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                team.name_status === 'approved' ? 'bg-green-900 text-green-300' :
                'bg-red-900 text-red-300'
              }`}>{team.name_status}</span>
            </div>

            {team.name_status === 'rejected' && team.name_rejection_reason && (
              <p className="text-xs text-red-400">Previous rejection: {team.name_rejection_reason}</p>
            )}

            <div className="flex gap-2 items-start">
              <input
                className="flex-1 rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                placeholder="Rejection reason (required to reject)"
                value={rejectReason[team.id] ?? ''}
                onChange={(e) => setRejectReason((r) => ({ ...r, [team.id]: e.target.value }))}
              />
              <button
                onClick={() => act('team_name', team.id, 'approve')}
                disabled={loading}
                className="px-3 py-1.5 rounded bg-green-800 text-green-300 text-xs hover:bg-green-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => act('team_name', team.id, 'reject')}
                disabled={loading}
                className="px-3 py-1.5 rounded bg-red-900 text-red-300 text-xs hover:bg-red-800 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Code Names */}
      <section className="space-y-3">
        <h2 className="font-semibold text-zinc-300">Player Code Names</h2>
        {players.length === 0 && <p className="text-zinc-500 text-sm">No code names to review.</p>}
        {players.map((player) => (
          <div key={player.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold">"{player.code_name}"</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  player.code_name_status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                  player.code_name_status === 'approved' ? 'bg-green-900 text-green-300' :
                  'bg-red-900 text-red-300'
                }`}>{player.code_name_status}</span>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">{player.name} — {player.user_email}</div>
            </div>

            {player.code_name_status === 'rejected' && player.code_name_rejection_reason && (
              <p className="text-xs text-red-400">Previous rejection: {player.code_name_rejection_reason}</p>
            )}

            <div className="flex gap-2 items-start">
              <input
                className="flex-1 rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                placeholder="Rejection reason"
                value={rejectReason[player.id] ?? ''}
                onChange={(e) => setRejectReason((r) => ({ ...r, [player.id]: e.target.value }))}
              />
              <button
                onClick={() => act('code_name', player.id, 'approve')}
                disabled={loading}
                className="px-3 py-1.5 rounded bg-green-800 text-green-300 text-xs hover:bg-green-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => act('code_name', player.id, 'reject')}
                disabled={loading}
                className="px-3 py-1.5 rounded bg-red-900 text-red-300 text-xs hover:bg-red-800 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

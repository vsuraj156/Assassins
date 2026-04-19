'use client'

import { useState } from 'react'

interface TeamPlayer {
  id: string
  name: string
  status: string
  is_double_0: boolean
}

interface Team {
  id: string
  name: string
  points: number
  captain_player_id: string | null
  players?: TeamPlayer[]
}

export default function TeamRosterCard({
  team: initialTeam,
  currentPlayerId,
  gameStatus,
  inviteCode,
}: {
  team: Team
  currentPlayerId?: string
  gameStatus?: string
  inviteCode?: string
}) {
  const [players, setPlayers] = useState<TeamPlayer[]>(initialTeam.players ?? [])
  const [loading, setLoading] = useState(false)

  const isCaptain = currentPlayerId && initialTeam.captain_player_id === currentPlayerId
  const canChangeDouble0 = isCaptain && gameStatus === 'signup'

  async function setDouble0(playerId: string) {
    setLoading(true)
    const res = await fetch('/api/player/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_double_0', player_id: playerId }),
    })
    if (res.ok) {
      setPlayers((prev) => prev.map((p) => ({ ...p, is_double_0: p.id === playerId })))
    }
    setLoading(false)
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-white">Team: {initialTeam.name}</h2>
        <span className="text-zinc-400 text-sm">{initialTeam.points} pts</span>
      </div>

      <div className="space-y-2">
        {players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center justify-between text-xs rounded px-3 py-2 border ${
              p.status === 'terminated' ? 'border-red-900 text-red-400 bg-red-950/20' :
              p.status === 'wanted' ? 'border-orange-800 text-orange-400' :
              p.status === 'exposed' ? 'border-yellow-800 text-yellow-400' :
              'border-zinc-700 text-zinc-300'
            }`}
          >
            <span>
              {p.name}
              {p.is_double_0 && <span className="ml-1.5 text-yellow-400 font-bold">(00)</span>}
              {p.id === currentPlayerId && <span className="ml-1.5 text-zinc-500">(you)</span>}
              <span className="ml-1.5 opacity-60">{p.status}</span>
            </span>

            {canChangeDouble0 && p.status !== 'terminated' && (
              <button
                onClick={() => setDouble0(p.id)}
                disabled={loading}
                className={`ml-3 text-xs px-2 py-0.5 rounded transition-colors disabled:opacity-40 ${
                  p.is_double_0
                    ? 'text-yellow-400 border border-yellow-800 hover:bg-yellow-950/40'
                    : 'text-zinc-500 border border-zinc-700 hover:text-yellow-400 hover:border-yellow-800'
                }`}
              >
                {p.is_double_0 ? '00 ✓' : 'Set 00'}
              </button>
            )}
          </div>
        ))}
      </div>

      {isCaptain && (
        <p className="text-xs text-zinc-600 mt-3">
          {canChangeDouble0
            ? 'As captain, you can designate one teammate as the Double-0 agent.'
            : 'Double-0 designation is locked once the game starts.'}
        </p>
      )}

      {inviteCode && gameStatus === 'signup' && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Team Invite Code</p>
          <p className="font-mono text-xl font-bold tracking-widest text-white">{inviteCode}</p>
          <p className="text-xs text-zinc-600 mt-1">Share with teammates to join this team</p>
        </div>
      )}
    </div>
  )
}

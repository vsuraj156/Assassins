'use client'

import { useState, useEffect } from 'react'

interface Game {
  id: string
  name: string
  status: string
  start_time: string | null
  kill_blackout_hours: number
  totem_description: string | null
}

interface Team {
  id: string
  name: string
  status: string
}

export default function GameControlPage() {
  const [games, setGames] = useState<Game[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [activeGameId, setActiveGameId] = useState<string>('')
  const [newGameName, setNewGameName] = useState('')
  const [totemDesc, setTotemDesc] = useState('')
  const [goldenGunTeamId, setGoldenGunTeamId] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchGames() }, [])
  useEffect(() => {
    if (activeGameId) fetchTeams(activeGameId)
  }, [activeGameId])

  async function fetchGames() {
    const res = await fetch('/api/admin/game')
    const data = await res.json()
    setGames(data)
    const active = data.find((g: Game) => g.status === 'active' || g.status === 'signup')
    if (active) setActiveGameId(active.id)
  }

  async function fetchTeams(gameId: string) {
    const res = await fetch(`/api/admin/teams?game_id=${gameId}`)
    const data = await res.json()
    setTeams(data)
  }

  async function action(payload: object) {
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) setMsg(`Error: ${data.error}`)
      else { setMsg('Done!'); fetchGames() }
    } finally {
      setLoading(false)
    }
  }

  const currentGame = games.find((g) => g.id === activeGameId)

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Game Control</h1>

      {msg && (
        <div className={`rounded-lg p-3 text-sm ${msg.startsWith('Error') ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-green-950 text-green-300 border border-green-800'}`}>
          {msg}
        </div>
      )}

      {/* Create Game */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <h2 className="font-semibold text-white">Create New Game</h2>
        <div className="flex gap-3">
          <input
            className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder="Game name (e.g. Spring 2026)"
            value={newGameName}
            onChange={(e) => setNewGameName(e.target.value)}
          />
          <button
            onClick={() => action({ action: 'create', name: newGameName })}
            disabled={!newGameName || loading}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium disabled:opacity-50 hover:bg-zinc-100 transition-colors"
          >
            Create
          </button>
        </div>
      </section>

      {/* Game Selector */}
      {games.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-zinc-400">Active game:</label>
          <select
            className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
            value={activeGameId}
            onChange={(e) => setActiveGameId(e.target.value)}
          >
            {games.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.status})</option>
            ))}
          </select>
        </div>
      )}

      {currentGame && (
        <>
          {/* Status Controls */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
            <h2 className="font-semibold text-white">Game Status: <span className={
              currentGame.status === 'active' ? 'text-green-400' :
              currentGame.status === 'signup' ? 'text-blue-400' :
              currentGame.status === 'ended' ? 'text-zinc-500' : 'text-zinc-400'
            }>{currentGame.status}</span></h2>

            <div className="flex gap-3 flex-wrap">
              {currentGame.status === 'setup' && (
                <button
                  onClick={() => action({ action: 'set_signup', game_id: currentGame.id })}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                >
                  Open Sign-up
                </button>
              )}
              {(currentGame.status === 'signup') && (
                <button
                  onClick={() => { if (confirm('Start the game? This will assign targets and lock membership.')) action({ action: 'start', game_id: currentGame.id }) }}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50"
                >
                  Start Game (assign targets)
                </button>
              )}
              {currentGame.status === 'active' && (
                <button
                  onClick={() => { if (confirm('End the game? This cannot be undone.')) action({ action: 'end', game_id: currentGame.id }) }}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50"
                >
                  End Game
                </button>
              )}
            </div>
          </section>

          {/* Seed Data */}
          {currentGame.status === 'signup' && (
            <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-6 space-y-4">
              <div>
                <h2 className="font-semibold text-white">Seed Test Data</h2>
                <p className="text-xs text-zinc-400 mt-1">Creates 10 teams with 3–6 players each using fake accounts. All names pre-approved. For testing only.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (!confirm('Seed 10 fake teams into this game?')) return
                    setLoading(true)
                    setMsg('')
                    const res = await fetch('/api/admin/seed', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ game_id: currentGame.id }),
                    })
                    const data = await res.json()
                    if (!res.ok) setMsg(`Error: ${data.error}`)
                    else { setMsg(`Seeded ${data.seeded.length} teams.`); fetchTeams(currentGame.id) }
                    setLoading(false)
                  }}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 disabled:opacity-50"
                >
                  Seed Test Data
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Delete all seed players and their teams?')) return
                    setLoading(true)
                    setMsg('')
                    const res = await fetch('/api/admin/seed', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ game_id: currentGame.id }),
                    })
                    const data = await res.json()
                    if (!res.ok) setMsg(`Error: ${data.error}`)
                    else { setMsg(`Deleted ${data.deleted} seed players.`); fetchTeams(currentGame.id) }
                    setLoading(false)
                  }}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-red-900 text-red-300 text-sm font-medium hover:bg-red-800 disabled:opacity-50"
                >
                  Clear Seed Data
                </button>
              </div>
            </section>
          )}

          {/* Golden Gun */}
          {currentGame.status === 'active' && (
            <section className="rounded-xl border border-yellow-800 bg-zinc-950 p-6 space-y-4">
              <h2 className="font-semibold text-white">Golden Gun</h2>
              <p className="text-xs text-zinc-400">Release the golden gun to a team — expires at 9:59 PM today.</p>
              <div className="flex gap-3">
                <select
                  className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
                  value={goldenGunTeamId}
                  onChange={(e) => setGoldenGunTeamId(e.target.value)}
                >
                  <option value="">Select team...</option>
                  {teams.filter(t => t.status === 'active').map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => { if (goldenGunTeamId) action({ action: 'golden_gun', game_id: currentGame.id, team_id: goldenGunTeamId }) }}
                  disabled={!goldenGunTeamId || loading}
                  className="px-4 py-2 rounded-lg bg-yellow-700 text-white text-sm font-medium hover:bg-yellow-600 disabled:opacity-50"
                >
                  Release
                </button>
              </div>
            </section>
          )}

          {/* Totem */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
            <h2 className="font-semibold text-white">Totem Description</h2>
            <textarea
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
              rows={3}
              placeholder="Describe the totem's current location..."
              value={totemDesc}
              onChange={(e) => setTotemDesc(e.target.value)}
            />
            <button
              onClick={() => action({ action: 'update_totem', game_id: currentGame.id, totem_description: totemDesc })}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 disabled:opacity-50"
            >
              Update Totem
            </button>
          </section>
        </>
      )}
    </div>
  )
}

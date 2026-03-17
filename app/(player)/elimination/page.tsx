'use client'

import { useState, useEffect } from 'react'

interface Player {
  id: string
  name: string
  user_email: string
}

interface Elimination {
  id: string
  status: string
  points: number
  timestamp: string
  target?: { name: string }
}

export default function EliminationPage() {
  const [targetPlayers, setTargetPlayers] = useState<Player[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [myElims, setMyElims] = useState<Elimination[]>([])

  useEffect(() => {
    fetchTarget()
    fetchMyElims()
  }, [])

  async function fetchTarget() {
    const res = await fetch('/api/player/target')
    const data = await res.json()
    setTargetPlayers(data.target?.players ?? [])
  }

  async function fetchMyElims() {
    const res = await fetch('/api/player/elimination')
    const data = await res.json()
    setMyElims(Array.isArray(data) ? data : [])
  }

  async function handleSubmit() {
    if (!selectedPlayerId) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/player/elimination', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_player_id: selectedPlayerId, notes }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error)
    } else {
      setSuccess(true)
      fetchMyElims()
    }
    setLoading(false)
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Report a Kill</h1>
        <p className="text-zinc-400 text-sm mt-1">Submit your kill claim for admin review.</p>
      </div>

      {success ? (
        <div className="rounded-xl border border-green-800 bg-green-950/20 p-6 text-center">
          <p className="text-green-400 font-semibold text-lg">Kill submitted!</p>
          <p className="text-zinc-400 text-sm mt-1">An admin will review and approve your claim.</p>
          <button onClick={() => { setSuccess(false); setSelectedPlayerId(''); setNotes('') }} className="mt-4 text-xs text-zinc-500 underline">
            Submit another
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-5">
          <div>
            <label className="block text-sm text-zinc-300 mb-2">Target player</label>
            {targetPlayers.length === 0 ? (
              <p className="text-zinc-500 text-sm">No target team assigned, or target is fully eliminated.</p>
            ) : (
              <select
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
              >
                <option value="">Select target...</option>
                {targetPlayers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-2">Notes (optional)</label>
            <textarea
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
              rows={3}
              placeholder="Where, when, how..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!selectedPlayerId || loading}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm disabled:opacity-50 hover:bg-zinc-100 transition-colors"
          >
            {loading ? 'Submitting...' : 'Submit Kill Claim'}
          </button>
        </div>
      )}

      {/* My kill history */}
      {myElims.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-zinc-300 text-sm">Your Kill Claims</h2>
          {myElims.map((e) => (
            <div key={e.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex items-center justify-between">
              <div>
                <span className="text-white text-sm">{e.target?.name}</span>
                <span className="text-zinc-500 text-xs ml-2">{new Date(e.timestamp).toLocaleString()}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                e.status === 'approved' ? 'bg-green-900 text-green-300' :
                e.status === 'rejected' ? 'bg-red-900 text-red-300' :
                'bg-yellow-900 text-yellow-300'
              }`}>{e.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

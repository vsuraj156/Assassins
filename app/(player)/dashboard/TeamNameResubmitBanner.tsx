'use client'

import { useState } from 'react'

export default function TeamNameResubmitBanner({ rejectionReason }: { rejectionReason: string | null }) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!value.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/player/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resubmit_team_name', team_name: value }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-300">
        Team name resubmitted — pending admin approval.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-red-800 bg-red-950/20 p-4 space-y-3">
      <div>
        <div className="text-red-400 font-semibold text-sm">Your team name was rejected</div>
        {rejectionReason && (
          <div className="text-red-300/70 text-xs mt-0.5">Reason: {rejectionReason}</div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          placeholder="New team name..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !value.trim()}
          className="px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold disabled:opacity-40 hover:bg-zinc-100 transition-colors"
        >
          {loading ? 'Submitting…' : 'Resubmit'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}

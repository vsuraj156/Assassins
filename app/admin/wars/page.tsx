'use client'

import { useState, useEffect } from 'react'

interface War {
  id: string
  status: string
  reason: string | null
  approved_at: string | null
  ended_at: string | null
  team1?: { name: string }
  team2?: { name: string }
  requested_by?: { name: string; user_email: string }
}

export default function AdminWarsPage() {
  const [wars, setWars] = useState<War[]>([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchWars() }, [filter])

  async function fetchWars() {
    const params = new URLSearchParams()
    if (filter) params.set('status', filter)
    const res = await fetch(`/api/admin/wars?${params}`)
    const data = await res.json()
    setWars(Array.isArray(data) ? data : [])
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Wars</h1>
        <div className="flex gap-2">
          {['pending', 'active', 'ended', ''].map((s) => (
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
                  <>
                    <button onClick={() => act(war.id, 'approve')} disabled={loading} className="px-3 py-1 rounded bg-red-800 text-red-300 text-xs hover:bg-red-700 disabled:opacity-50">
                      Approve War
                    </button>
                    <button onClick={() => act(war.id, 'reject')} disabled={loading} className="px-3 py-1 rounded bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600 disabled:opacity-50">
                      Reject
                    </button>
                  </>
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

'use client'

import { useState, useEffect } from 'react'

interface Elimination {
  id: string
  status: string
  points: number
  timestamp: string
  notes: string | null
  is_double_0: boolean
  killer?: { name: string; user_email: string }
  target?: { name: string; user_email: string; status: string }
  killer_team?: { name: string }
  target_team?: { name: string }
}

interface PendingCascade {
  eliminatedTeamId: string
  eliminatedTeamName: string
  newTargetTeamId: string
  newTargetTeamName: string
  hunterTeamId: string
  killerTeamId: string
}

export default function AdminEliminationsPage() {
  const [eliminations, setEliminations] = useState<Elimination[]>([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(false)
  const [pendingCascade, setPendingCascade] = useState<PendingCascade | null>(null)

  useEffect(() => { fetchEliminations() }, [filter])

  async function fetchEliminations() {
    const params = new URLSearchParams()
    if (filter) params.set('status', filter)
    const res = await fetch(`/api/admin/eliminations?${params}`)
    const data = await res.json()
    setEliminations(Array.isArray(data) ? data : [])
  }

  async function act(eliminationId: string, action: 'approve' | 'reject') {
    if (action === 'approve' && !confirm('Approve this kill? This will terminate the target.')) return
    setLoading(true)
    const res = await fetch('/api/admin/eliminations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elimination_id: eliminationId, action }),
    })
    const data = await res.json()
    if (data.teamEliminated) {
      setPendingCascade({
        eliminatedTeamId: data.eliminatedTeamId,
        eliminatedTeamName: data.eliminatedTeamName,
        newTargetTeamId: data.newTargetTeamId,
        newTargetTeamName: data.newTargetTeamName,
        hunterTeamId: data.hunterTeamId,
        killerTeamId: data.killerTeamId,
      })
    }
    await fetchEliminations()
    setLoading(false)
  }

  async function advanceTargetChain(dryRun: boolean) {
    if (!pendingCascade) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/eliminations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance_target_chain',
          eliminated_team_id: pendingCascade.eliminatedTeamId,
          hunter_team_id: pendingCascade.hunterTeamId,
          killer_team_id: pendingCascade.killerTeamId,
          dry_run: dryRun,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      if (dryRun) {
        const notify = (data.playersToNotify ?? []).map((p: { name: string; email: string }) => `${p.name} (${p.email})`).join(', ')
        alert(`Dry run:\n- Eliminated team: ${data.eliminatedTeamName}\n- New target: ${data.newTargetTeamName}\n- Players to notify: ${notify}`)
      } else {
        setPendingCascade(null)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Kill Approvals</h1>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', ''].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filter === s ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {pendingCascade && (
        <div className="rounded-xl border border-yellow-600 bg-yellow-950 p-5 space-y-3">
          <p className="text-yellow-300 font-semibold">Team eliminated — target chain needs advancing</p>
          <p className="text-sm text-yellow-200">
            <strong>{pendingCascade.eliminatedTeamName}</strong> is fully eliminated.
            Their assigned hunter will inherit their target: <strong>{pendingCascade.newTargetTeamName}</strong>.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => advanceTargetChain(true)}
              disabled={loading}
              className="px-3 py-1 rounded bg-yellow-800 text-yellow-200 text-xs font-medium hover:bg-yellow-700 disabled:opacity-50"
            >
              Dry run (preview)
            </button>
            <button
              onClick={() => advanceTargetChain(false)}
              disabled={loading}
              className="px-3 py-1 rounded bg-green-800 text-green-300 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Confirm &amp; advance
            </button>
            <button
              onClick={() => setPendingCascade(null)}
              disabled={loading}
              className="px-3 py-1 rounded bg-zinc-800 text-zinc-400 text-xs font-medium hover:bg-zinc-700 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {eliminations.map((e) => (
          <div key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-300">{e.killer?.name}</span>
                  <span className="text-zinc-600">({e.killer_team?.name})</span>
                  <span className="text-zinc-500">→</span>
                  <span className="text-white font-semibold">{e.target?.name}</span>
                  <span className="text-zinc-600">({e.target_team?.name})</span>
                  {e.is_double_0 && <span className="text-yellow-400 text-xs font-bold">DOUBLE-0 (+{e.points}pts)</span>}
                </div>
                <div className="text-xs text-zinc-500">
                  {new Date(e.timestamp).toLocaleString()}
                  {e.notes && <span className="ml-3 text-zinc-400">Note: {e.notes}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  e.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                  e.status === 'approved' ? 'bg-green-900 text-green-300' :
                  'bg-red-900 text-red-300'
                }`}>{e.status}</span>

                {e.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(e.id, 'approve')}
                      disabled={loading}
                      className="px-3 py-1 rounded bg-green-800 text-green-300 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act(e.id, 'reject')}
                      disabled={loading}
                      className="px-3 py-1 rounded bg-red-900 text-red-300 text-xs font-medium hover:bg-red-800 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {eliminations.length === 0 && (
          <p className="text-center text-zinc-500 py-12">No {filter} eliminations.</p>
        )}
      </div>
    </div>
  )
}

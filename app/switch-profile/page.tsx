'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface PlayerProfile {
  id: string
  name: string
  status: string
  game_id: string
  team?: { name: string } | null
}

export default function SwitchProfilePage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<PlayerProfile[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/player/profiles').then((r) => r.json()).then((d) => setProfiles(d ?? []))
  }, [])

  async function switchTo(playerId: string) {
    setLoading(true)
    await fetch('/api/player/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId }),
    })
    // Force a full reload so the session re-evaluates with the new cookie
    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Switch Profile</h1>
          <p className="text-zinc-400 text-sm mt-1">Choose which player you are.</p>
        </div>

        <div className="space-y-3">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => switchTo(p.id)}
              disabled={loading}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left hover:border-zinc-600 transition-colors disabled:opacity-50"
            >
              <div className="font-semibold text-white">{p.name}</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {p.team?.name ?? 'No team'} · <span className="capitalize">{p.status}</span>
              </div>
            </button>
          ))}
          {profiles.length === 0 && (
            <p className="text-zinc-500 text-sm">No profiles found.</p>
          )}
        </div>

        <button
          onClick={() => router.back()}
          className="w-full text-sm text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

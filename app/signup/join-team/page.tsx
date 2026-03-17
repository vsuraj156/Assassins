'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function JoinTeamPage() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [codeName, setCodeName] = useState('')
  const [gameId, setGameId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin() {
    if (!inviteCode || !playerName || !gameId) {
      setError('Please fill in all required fields.')
      return
    }
    setLoading(true)
    setError('')

    const res = await fetch('/api/player/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'join',
        invite_code: inviteCode,
        game_id: gameId,
        player_name: playerName,
        code_name: codeName || undefined,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Join a Team</h1>
        <p className="text-zinc-400 text-sm mt-1">Enter the invite code your team captain shared with you.</p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-5">
        <div>
          <label className="block text-sm text-zinc-300 mb-2">Game ID <span className="text-red-400">*</span></label>
          <input
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder="Ask your game admin for the Game ID"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-2">Invite Code <span className="text-red-400">*</span></label>
          <input
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm font-mono tracking-widest text-white placeholder-zinc-500 uppercase focus:outline-none focus:border-zinc-500"
            placeholder="XXXXXX"
            maxLength={6}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-2">Your Name <span className="text-red-400">*</span></label>
          <input
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder="Your real name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-2">Code Name <span className="text-zinc-500">(optional)</span></label>
          <input
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder="Your secret agent alias..."
            value={codeName}
            onChange={(e) => setCodeName(e.target.value)}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-white text-black font-semibold disabled:opacity-50 hover:bg-zinc-100 transition-colors"
        >
          {loading ? 'Joining...' : 'Join Team'}
        </button>
      </div>

      <p className="text-center text-sm text-zinc-500">
        Don't have an invite code?{' '}
        <a href="/signup/create-team" className="text-white underline">Create your own team</a>
      </p>
    </div>
  )
}

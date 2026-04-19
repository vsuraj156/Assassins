'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function JoinTeamPage() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [codeName, setCodeName] = useState('')
  const [gameId, setGameId] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin() {
    if (!inviteCode || !playerName || !gameId || !codeName || !photoFile) {
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

    // Upload profile photo
    if (data.player?.id) {
      try {
        const urlRes = await fetch('/api/player/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_upload_url', player_id: data.player.id }),
        })
        const { signedUrl, path } = await urlRes.json()
        await fetch(signedUrl, { method: 'PUT', body: photoFile, headers: { 'Content-Type': photoFile.type } })
        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assassins/${path}`
        await fetch('/api/player/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save', player_id: data.player.id, photo_url: publicUrl }),
        })
      } catch {
        setError('Joined team, but your photo failed to upload. Please update it from your dashboard.')
        setLoading(false)
        return
      }
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
          <label className="block text-sm text-zinc-300 mb-2">Code Name <span className="text-red-400">*</span></label>
          <input
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder="Your secret agent alias..."
            value={codeName}
            onChange={(e) => setCodeName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-2">Profile Photo <span className="text-red-400">*</span></label>
          <div
            className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900 p-4 text-center cursor-pointer hover:border-zinc-500 transition-colors"
            onClick={() => document.getElementById('photo-input-join')?.click()}
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Preview" className="w-24 h-24 mx-auto rounded-full object-cover" />
            ) : (
              <div className="space-y-1">
                <p className="text-zinc-400 text-sm">Click to select a photo</p>
                <p className="text-zinc-600 text-xs">Clear face shot — helps teammates identify targets</p>
              </div>
            )}
          </div>
          <input
            id="photo-input-join"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)) }
            }}
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

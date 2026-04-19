'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ensureJpeg } from '@/lib/convertImage'

export default function CreateTeamPage() {
  const router = useRouter()
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [inviteCode, setInviteCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [codeName, setCodeName] = useState('')
  const [gameId, setGameId] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!teamName || !playerName || !gameId || !codeName || !photoFile) {
      setError('Please fill in all required fields.')
      return
    }
    setLoading(true)
    setError('')

    const res = await fetch('/api/player/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        game_id: gameId,
        team_name: teamName,
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
        const uploadFile = await ensureJpeg(photoFile)
        await fetch(signedUrl, { method: 'PUT', body: uploadFile, headers: { 'Content-Type': uploadFile.type } })
        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assassins/${path}`
        await fetch('/api/player/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save', player_id: data.player.id, photo_url: publicUrl }),
        })
      } catch {
        setInviteCode(data.team.invite_code)
        setStep('success')
        setLoading(false)
        setError('Team created, but your photo failed to upload. Please update it from your dashboard.')
        return
      }
    }

    setInviteCode(data.team.invite_code)
    setStep('success')
    setLoading(false)
  }

  if (step === 'success') {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Team Created!</h1>
          <p className="text-zinc-400">Share your invite code with your teammates.</p>
        </div>

        <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-8">
          <p className="text-zinc-400 text-sm mb-3">Invite Code</p>
          <p className="text-6xl font-bold font-mono tracking-widest text-white">{inviteCode}</p>
          <p className="text-zinc-500 text-xs mt-4">Up to 5 teammates can join with this code</p>
        </div>

        <div className="rounded-xl border border-yellow-800 bg-yellow-950/20 p-4 text-left text-sm text-yellow-300 space-y-1">
          <p>⚠ Your team name is pending admin approval.</p>
          <p>⚠ Your code name is pending approval (if provided).</p>
          <p>You will be notified if rejected and asked to resubmit.</p>
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="w-full py-3 rounded-xl bg-white text-black font-semibold hover:bg-zinc-100"
        >
          Go to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Create Your Team</h1>
        <p className="text-zinc-400 text-sm mt-1">You'll become the team captain and get an invite code to share.</p>
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
          <label className="block text-sm text-zinc-300 mb-2">Team Name <span className="text-red-400">*</span></label>
          <input
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder="Choose a creative team name..."
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
          <p className="text-xs text-zinc-600 mt-1">Will be reviewed by admins before the game starts.</p>
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
          <p className="text-xs text-zinc-600 mt-1">Subject to admin approval.</p>
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-2">Profile Photo <span className="text-red-400">*</span></label>
          <div
            className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900 p-4 text-center cursor-pointer hover:border-zinc-500 transition-colors"
            onClick={() => document.getElementById('photo-input-create')?.click()}
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
            id="photo-input-create"
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
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-white text-black font-semibold disabled:opacity-50 hover:bg-zinc-100 transition-colors"
        >
          {loading ? 'Creating...' : 'Create Team'}
        </button>
      </div>

      <p className="text-center text-sm text-zinc-500">
        Already have an invite code?{' '}
        <a href="/signup/join-team" className="text-white underline">Join an existing team</a>
      </p>
    </div>
  )
}

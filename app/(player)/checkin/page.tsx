'use client'

import { useState, useEffect } from 'react'

interface Checkin {
  id: string
  status: string
  meal_date: string
  photo_url: string
  submitted_at: string
}

export default function CheckinPage() {
  const [todayCheckin, setTodayCheckin] = useState<Checkin | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    fetch('/api/player/checkin').then(r => r.json()).then(d => setTodayCheckin(d.checkin))
  }, [])

  async function handleSubmit() {
    if (!file) return
    setError('')
    setUploading(true)

    try {
      // Get signed upload URL
      const urlRes = await fetch('/api/player/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_upload_url' }),
      })
      const { signedUrl, path } = await urlRes.json()

      // Upload directly to Supabase Storage
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) throw new Error('Upload failed')

      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assassins/${path}`

      // Submit checkin
      setUploading(false)
      setSubmitting(true)
      const submitRes = await fetch('/api/player/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', photo_url: publicUrl }),
      })
      const data = await submitRes.json()
      if (!submitRes.ok) throw new Error(data.error)

      setTodayCheckin(data)
      setSuccess(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      setSubmitting(false)
    }
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  if (todayCheckin?.status === 'approved') {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-4">
        <div className="text-6xl">✓</div>
        <h1 className="text-2xl font-bold text-green-400">Checked in!</h1>
        <p className="text-zinc-400">Your check-in for today has been approved.</p>
      </div>
    )
  }

  if (todayCheckin?.status === 'pending') {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-4">
        <div className="text-5xl">⏳</div>
        <h1 className="text-2xl font-bold text-yellow-400">Pending Review</h1>
        <p className="text-zinc-400">Your check-in photo is awaiting admin approval.</p>
        <p className="text-xs text-zinc-600">Submitted at {new Date(todayCheckin.submitted_at).toLocaleTimeString()}</p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Daily Check-in</h1>
        <p className="text-zinc-400 text-sm mt-1">{today}</p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400 space-y-1">
        <p>Take a photo of your meal at a Quincy dining hall or other approved location.</p>
        <p>Must be submitted before midnight. Missing check-ins advance your status toward terminated.</p>
      </div>

      {success ? (
        <div className="rounded-xl border border-yellow-800 bg-yellow-950/20 p-6 text-center">
          <p className="text-yellow-400 font-semibold">Submitted! Awaiting admin approval.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className="rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950 p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
            onClick={() => document.getElementById('photo-input')?.click()}
          >
            {preview ? (
              <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg object-cover" />
            ) : (
              <div className="space-y-2">
                <div className="text-4xl">📸</div>
                <p className="text-zinc-400 text-sm">Tap to select a photo</p>
                <p className="text-zinc-600 text-xs">JPG, PNG up to 10MB</p>
              </div>
            )}
          </div>

          <input
            id="photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setFile(f)
                setPreview(URL.createObjectURL(f))
              }
            }}
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!file || uploading || submitting}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm disabled:opacity-50 hover:bg-zinc-100 transition-colors"
          >
            {uploading ? 'Uploading...' : submitting ? 'Submitting...' : 'Submit Check-in'}
          </button>
        </div>
      )}
    </div>
  )
}

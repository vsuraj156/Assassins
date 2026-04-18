'use client'

import { useState, useEffect } from 'react'

interface Checkin {
  id: string
  status: string
  meal_date: string
  meal_time: string
  photo_url: string
  submitted_at: string
}

type MealWindow = 'breakfast' | 'lunch' | 'dinner'

const MEAL_WINDOWS: { key: MealWindow; label: string; hours: string }[] = [
  { key: 'breakfast', label: 'Breakfast', hours: '7:30 – 11:00 AM' },
  { key: 'lunch',     label: 'Lunch',     hours: '11:30 AM – 2:30 PM' },
  { key: 'dinner',   label: 'Dinner',     hours: '5:00 – 8:00 PM' },
]

function getCurrentMealWindow(): MealWindow | null {
  const now = new Date()
  // EDT = UTC-4
  const edtMins = ((now.getUTCHours() * 60 + now.getUTCMinutes() - 240) % 1440 + 1440) % 1440
  if (edtMins >= 450 && edtMins < 660) return 'breakfast'   // 7:30–11:00
  if (edtMins >= 690 && edtMins < 870) return 'lunch'        // 11:30–14:30
  if (edtMins >= 1020 && edtMins < 1200) return 'dinner'     // 17:00–20:00
  return null
}

export default function CheckinPage() {
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [activeWindow, setActiveWindow] = useState<MealWindow | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<MealWindow | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    setActiveWindow(getCurrentMealWindow())
    fetch('/api/player/checkin').then(r => r.json()).then(d => setCheckins(d.checkins ?? []))
  }, [])

  function checkinFor(window: MealWindow) {
    return checkins.find(c => c.meal_time === window)
  }

  async function handleSubmit() {
    if (!file || !activeWindow) return
    setError('')
    setUploading(true)

    try {
      const urlRes = await fetch('/api/player/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_upload_url' }),
      })
      const urlData = await urlRes.json()
      if (!urlRes.ok) throw new Error(urlData.error)
      const { signedUrl, path } = urlData

      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) throw new Error('Upload failed')

      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assassins/${path}`

      setUploading(false)
      setSubmitting(true)
      const submitRes = await fetch('/api/player/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', photo_url: publicUrl }),
      })
      const data = await submitRes.json()
      if (!submitRes.ok) throw new Error(data.error)

      setCheckins(prev => [...prev.filter(c => c.meal_time !== activeWindow), data])
      setSuccess(activeWindow)
      setFile(null)
      setPreview(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      setSubmitting(false)
    }
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Daily Check-in</h1>
        <p className="text-zinc-400 text-sm mt-1">{today}</p>
      </div>

      {/* Meal window status overview */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 divide-y divide-zinc-800">
        {MEAL_WINDOWS.map(({ key, label, hours }) => {
          const existing = checkinFor(key)
          const isActive = activeWindow === key
          return (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-zinc-400'}`}>{label}</span>
                <span className="ml-2 text-xs text-zinc-600">{hours} EDT</span>
              </div>
              {existing ? (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  existing.status === 'approved' ? 'bg-green-900/40 text-green-400' :
                  existing.status === 'pending'  ? 'bg-yellow-900/40 text-yellow-400' :
                                                   'bg-red-900/40 text-red-400'
                }`}>
                  {existing.status}
                </span>
              ) : isActive ? (
                <span className="text-xs text-blue-400 font-medium">Open now</span>
              ) : (
                <span className="text-xs text-zinc-600">—</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Submission form — only shown during an active window that hasn't been used */}
      {activeWindow && !checkinFor(activeWindow) && success !== activeWindow && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Submit your {activeWindow} check-in photo.
          </p>
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
              if (f) { setFile(f); setPreview(URL.createObjectURL(f)) }
            }}
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!file || uploading || submitting}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm disabled:opacity-50 hover:bg-zinc-100 transition-colors"
          >
            {uploading ? 'Uploading...' : submitting ? 'Submitting...' : `Submit ${activeWindow.charAt(0).toUpperCase() + activeWindow.slice(1)} Check-in`}
          </button>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-yellow-800 bg-yellow-950/20 p-6 text-center">
          <p className="text-yellow-400 font-semibold capitalize">{success} submitted! Awaiting admin approval.</p>
        </div>
      )}

      {!activeWindow && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-center">
          <p className="text-zinc-500 text-sm">No meal window is currently open.</p>
          <p className="text-zinc-600 text-xs mt-1">Check-ins are accepted during Breakfast, Lunch, and Dinner only.</p>
        </div>
      )}

      {activeWindow && checkinFor(activeWindow) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-center">
          <p className="text-zinc-400 text-sm capitalize">
            {activeWindow} check-in already submitted ({checkinFor(activeWindow)?.status}).
          </p>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useRef } from 'react'
import { preparePhoto } from '@/lib/convertImage'

export default function PhotoResubmitBanner({ rejectionReason }: { rejectionReason: string | null }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    if (f) setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit() {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const urlRes = await fetch('/api/player/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_upload_url' }),
      })
      const { signedUrl, path } = await urlRes.json()
      const uploadFile = await preparePhoto(file)
      await fetch(signedUrl, { method: 'PUT', body: uploadFile, headers: { 'Content-Type': uploadFile.type } })
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assassins/${path}`
      const saveRes = await fetch('/api/player/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', photo_url: publicUrl }),
      })
      if (!saveRes.ok) {
        const data = await saveRes.json()
        setError(data.error ?? 'Upload failed')
        return
      }
      setDone(true)
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-300">
        Photo submitted — pending admin approval.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-red-800 bg-red-950/20 p-4 space-y-3">
      <div>
        <div className="text-red-400 font-semibold text-sm">Your profile photo was rejected</div>
        {rejectionReason && (
          <div className="text-red-300/70 text-xs mt-0.5">Reason: {rejectionReason}</div>
        )}
      </div>
      <div className="flex gap-3 items-center">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
        )}
        <div className="flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            onChange={handleFileChange}
            className="block w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-800 file:text-zinc-300 file:text-xs hover:file:bg-zinc-700 cursor-pointer"
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !file}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold disabled:opacity-40 hover:bg-zinc-100 transition-colors"
          >
            {loading ? 'Uploading…' : 'Resubmit Photo'}
          </button>
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}

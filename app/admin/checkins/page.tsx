'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface Checkin {
  id: string
  photo_url: string
  meal_date: string
  status: string
  submitted_at: string
  player?: { id: string; name: string; user_email: string; team?: { name: string } }
}

export default function AdminCheckinsPage() {
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchCheckins() }, [filter])

  async function fetchCheckins() {
    const params = new URLSearchParams()
    if (filter) params.set('status', filter)
    const res = await fetch(`/api/admin/checkins?${params}`)
    const data = await res.json()
    setCheckins(Array.isArray(data) ? data : [])
  }

  async function act(checkinId: string, action: 'approve' | 'reject') {
    setLoading(true)
    await fetch('/api/admin/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkin_id: checkinId, action }),
    })
    await fetchCheckins()
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Check-in Approvals</h1>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {checkins.map((checkin) => (
          <div key={checkin.id} className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
            <div className="relative aspect-video bg-zinc-900">
              <Image
                src={checkin.photo_url}
                alt={`Check-in by ${checkin.player?.name}`}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="font-medium text-white">{checkin.player?.name}</div>
                <div className="text-xs text-zinc-500">{checkin.player?.team?.name}</div>
                <div className="text-xs text-zinc-500">Meal date: {checkin.meal_date}</div>
                <div className="text-xs text-zinc-600">{new Date(checkin.submitted_at).toLocaleString()}</div>
              </div>

              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  checkin.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                  checkin.status === 'approved' ? 'bg-green-900 text-green-300' :
                  'bg-red-900 text-red-300'
                }`}>{checkin.status}</span>

                {checkin.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(checkin.id, 'approve')}
                      disabled={loading}
                      className="px-3 py-1 rounded bg-green-800 text-green-300 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act(checkin.id, 'reject')}
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
      </div>

      {checkins.length === 0 && (
        <p className="text-center text-zinc-500 py-12">No {filter} check-ins.</p>
      )}
    </div>
  )
}

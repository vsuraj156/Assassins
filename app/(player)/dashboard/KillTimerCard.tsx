'use client'

import { useEffect, useState } from 'react'

function timerStyle(msLeft: number | null) {
  const h = msLeft === null ? null : msLeft / (1000 * 60 * 60)
  if (h === null || h <= 6)  return { border: 'border-red-800',    text: 'text-red-400',    bg: 'bg-red-950/20' }
  if (h <= 12)               return { border: 'border-orange-800', text: 'text-orange-400', bg: 'bg-orange-950/20' }
  if (h <= 24)               return { border: 'border-yellow-800', text: 'text-yellow-400', bg: 'bg-yellow-950/10' }
  return                            { border: 'border-zinc-700',   text: 'text-zinc-300',   bg: '' }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Overdue — penalty imminent'
  const h = Math.floor(ms / (1000 * 60 * 60))
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  const s = Math.floor((ms % (1000 * 60)) / 1000)
  if (h > 0) return `${h}h ${m}m ${s}s remaining`
  if (m > 0) return `${m}m ${s}s remaining`
  return `${s}s remaining`
}

interface Props {
  deadlineMs: number | null
  killWindowHours: number
}

export default function KillTimerCard({ deadlineMs, killWindowHours }: Props) {
  const [msLeft, setMsLeft] = useState<number | null>(
    deadlineMs === null ? null : Math.max(0, deadlineMs - Date.now())
  )

  useEffect(() => {
    if (deadlineMs === null) return
    const tick = () => setMsLeft(Math.max(0, deadlineMs - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadlineMs])

  const style = timerStyle(msLeft)
  const showWarning = msLeft === null || msLeft <= 12 * 60 * 60 * 1000

  return (
    <div className={`rounded-xl border p-4 ${style.border} ${style.bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-zinc-500 mb-0.5">Team Kill Timer</div>
          <div className={`text-sm font-semibold ${style.text}`}>
            {msLeft === null ? 'No kills yet — your team is at risk' : formatCountdown(msLeft)}
          </div>
        </div>
        <div className="text-xs text-zinc-600">{killWindowHours}h window</div>
      </div>
      {showWarning && (
        <p className="text-xs text-zinc-500 mt-2">
          A random active teammate will be exposed if no kill is made in time.
        </p>
      )}
    </div>
  )
}

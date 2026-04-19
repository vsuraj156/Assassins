'use client'

import { useState } from 'react'

export function PhotoModal({
  src,
  name,
  terminated,
}: {
  src: string | null
  name: string
  terminated: boolean
}) {
  const [open, setOpen] = useState(false)
  const initial = name.charAt(0).toUpperCase()

  return (
    <>
      <button
        onClick={() => src && setOpen(true)}
        className={`w-7 h-7 rounded-full overflow-hidden flex-shrink-0 ${src ? 'cursor-pointer hover:ring-2 hover:ring-zinc-400 transition-all' : 'cursor-default'}`}
        aria-label={src ? `View photo of ${name}` : undefined}
        type="button"
      >
        {src ? (
          <img
            src={src}
            alt={name}
            className={`w-full h-full object-cover ${terminated ? 'opacity-30 grayscale' : ''}`}
          />
        ) : (
          <div className={`w-full h-full bg-zinc-800 flex items-center justify-center text-xs font-medium ${terminated ? 'opacity-30' : 'text-zinc-400'}`}>
            {initial}
          </div>
        )}
      </button>

      {open && src && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="relative max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={src}
              alt={name}
              className="w-full rounded-xl object-cover shadow-2xl"
            />
            <div className="mt-2 text-center text-sm text-zinc-300">{name}</div>
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white text-xs flex items-center justify-center"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}

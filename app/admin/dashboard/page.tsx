import { createServerClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const db = createServerClient()

  const [{ data: games }, { data: recentElims }, { data: pendingCheckins }, { data: pendingWars }] =
    await Promise.all([
      db.from('games').select('*, teams!game_id(count), players!game_id(count)').order('created_at', { ascending: false }),
      db.from('eliminations').select('*, killer:players!killer_id(name), target:players!target_id(name), killer_team:teams!killer_team_id(name)')
        .eq('status', 'pending').order('timestamp', { ascending: false }).limit(10),
      db.from('checkins').select('id').eq('status', 'pending'),
      db.from('wars').select('id').eq('status', 'pending'),
    ])

  const activeGame = games?.find((g) => g.status === 'active')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        {activeGame && (
          <p className="text-zinc-400 text-sm mt-1">Active game: <span className="text-white">{activeGame.name}</span></p>
        )}
      </div>

      {/* Stats Row */}
      {activeGame && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Pending Kills', value: recentElims?.length ?? 0, urgent: (recentElims?.length ?? 0) > 0 },
            { label: 'Pending Check-ins', value: pendingCheckins?.length ?? 0, urgent: false },
            { label: 'Pending Wars', value: pendingWars?.length ?? 0, urgent: false },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-xl border p-4 ${stat.urgent ? 'border-red-800 bg-red-950/30' : 'border-zinc-800 bg-zinc-950'}`}
            >
              <p className="text-xs text-zinc-500">{stat.label}</p>
              <p className={`text-3xl font-bold mt-1 ${stat.urgent ? 'text-red-400' : 'text-white'}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Games List */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="font-semibold text-white">Games</h2>
        </div>
        {!games?.length ? (
          <p className="p-6 text-zinc-500 text-sm">No games yet. Go to Game Control to create one.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Started</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr key={game.id} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                  <td className="p-3 text-white font-medium">{game.name}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      game.status === 'active' ? 'bg-green-900 text-green-300' :
                      game.status === 'signup' ? 'bg-blue-900 text-blue-300' :
                      game.status === 'ended' ? 'bg-zinc-700 text-zinc-400' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {game.status}
                    </span>
                  </td>
                  <td className="p-3 text-zinc-400">
                    {game.start_time ? new Date(game.start_time).toLocaleDateString('en-US', { timeZone: 'America/New_York' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pending Kills */}
      {(recentElims?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-red-900 bg-zinc-950 overflow-hidden">
          <div className="p-4 border-b border-red-900 flex items-center justify-between">
            <h2 className="font-semibold text-white">Pending Kill Approvals</h2>
            <a href="/admin/eliminations" className="text-xs text-red-400 hover:text-red-300">Review all →</a>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {recentElims?.map((e) => (
                <tr key={e.id} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                  <td className="p-3 text-zinc-300">{e.killer?.name}</td>
                  <td className="p-3 text-zinc-500">→</td>
                  <td className="p-3 text-white font-medium">{e.target?.name}</td>
                  <td className="p-3 text-zinc-500 text-xs">{e.killer_team?.name}</td>
                  <td className="p-3 text-zinc-500 text-xs">{new Date(e.timestamp).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function RulesPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-white">Game Rules</h1>

      {[
        {
          title: 'Objective',
          content: 'Eliminate your assigned target team. Last team standing wins.'
        },
        {
          title: 'Status Levels',
          content: 'Active → Exposed → Wanted → Terminated. Daily check-ins are required to stay Active.'
        },
        {
          title: 'Daily Check-in',
          content: 'Submit a photo of your meal at the dining hall every day before midnight. Missing a day advances your status. Active → Exposed → Wanted → Terminated.'
        },
        {
          title: 'Team Kill Timer',
          content: 'Your team must make a kill every 48 hours. If you fail to, a random active team member becomes Exposed. Making a kill resets the timer.'
        },
        {
          title: 'Eliminations',
          content: 'You may only eliminate players from your assigned target team (unless at war, or you hold the Golden Gun). Submit a kill claim immediately after. Kills are confirmed by admins.'
        },
        {
          title: 'Double-0 Agents',
          content: 'Each team designates one Double-0 agent. Double-0s are worth 2 points when eliminated. Double-0s can eliminate any other Double-0 regardless of target assignment.'
        },
        {
          title: 'Wars',
          content: 'Request a war against another team. Once approved, both teams may eliminate each other (in addition to their regular targets). Wars must be approved by admins.'
        },
        {
          title: 'Stuns',
          content: 'Stuns prevent a player from being eliminated until midnight.'
        },
        {
          title: 'Golden Gun',
          content: 'When released by admins, the Golden Gun team may eliminate any player. It expires at 9:59 PM on the day of release.'
        },
        {
          title: 'Rogue Agents',
          content: 'A rogue agent can kill or be killed by anyone. Use with caution.'
        },
        {
          title: 'Kill Log Blackout',
          content: 'Approved kills are hidden from the public kill log for 48 hours.'
        },
        {
          title: 'Target Chain',
          content: 'When your target team is fully eliminated, you inherit their assigned target. The chain is circular.'
        }
      ].map((rule) => (
        <section key={rule.title} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-bold text-white mb-2">{rule.title}</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">{rule.content}</p>
        </section>
      ))}

      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <p className="text-zinc-400 text-sm">
          For the full official rules, see{' '}
          <a href="https://quincyassassins.wordpress.com/rules" target="_blank" rel="noopener noreferrer" className="text-white underline">
            quincyassassins.wordpress.com/rules
          </a>
        </p>
      </div>
    </div>
  )
}

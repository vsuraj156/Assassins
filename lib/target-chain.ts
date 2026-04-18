import { createServerClient } from './db'
import { sendTargetUpdateEmail } from './email'

type DB = ReturnType<typeof createServerClient>

/**
 * After a cron penalty terminates a player, call this to check whether their
 * team is now fully eliminated and repair the target chain if so.
 *
 * The hunter (the team whose assigned target was eliminated) inherits the
 * eliminated team's former target — not necessarily the team that caused
 * the elimination.
 */
export async function repairTargetChainIfTeamEliminated(db: DB, teamId: string): Promise<void> {
  const { data: survivors } = await db
    .from('players')
    .select('id')
    .eq('team_id', teamId)
    .not('status', 'eq', 'terminated')

  if (survivors && survivors.length > 0) return

  const { data: eliminatedTeam } = await db
    .from('teams')
    .select('status, target_team_id')
    .eq('id', teamId)
    .single()

  if (!eliminatedTeam) return

  if (eliminatedTeam.status === 'active') {
    await db.from('teams').update({ status: 'eliminated' }).eq('id', teamId)
    await db.from('status_history').insert({
      entity_type: 'team',
      entity_id: teamId,
      old_status: 'active',
      new_status: 'eliminated',
      reason: 'All members eliminated',
      changed_by: null,
    })
  }

  const newTargetId = eliminatedTeam.target_team_id
  if (!newTargetId) return

  const { data: hunterTeam } = await db
    .from('teams')
    .select('id')
    .eq('target_team_id', teamId)
    .eq('status', 'active')
    .single()

  if (!hunterTeam || hunterTeam.id === newTargetId) return

  const { data: newTargetTeam } = await db.from('teams').select('name').eq('id', newTargetId).single()

  await db.from('teams').update({ target_team_id: newTargetId }).eq('id', hunterTeam.id)

  if (newTargetTeam) {
    const { data: hunterPlayers } = await db
      .from('players')
      .select('name, user_email')
      .eq('team_id', hunterTeam.id)
      .neq('status', 'terminated')

    for (const player of hunterPlayers ?? []) {
      if (player.user_email) {
        await sendTargetUpdateEmail(player.user_email, player.name, newTargetTeam.name)
      }
    }
  }
}

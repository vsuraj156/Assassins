import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { cookies } from 'next/headers'
import { createServerClient } from './db'

function isMultiProfileEmail(email: string): boolean {
  const allowed = (process.env.MULTI_PROFILE_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase())
  return allowed.includes(email.toLowerCase())
}

export { isMultiProfileEmail }

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session }) {
      if (!session.user?.email) return session

      const db = createServerClient()

      let activePlayerId: string | undefined
      if (isMultiProfileEmail(session.user.email)) {
        try {
          const cookieStore = await cookies()
          activePlayerId = cookieStore.get('active_player_id')?.value
        } catch {
          // cookies() throws outside request context (e.g. during build)
        }
      }

      let query = db
        .from('players')
        .select('id, role, status, team_id, game_id, name, photo_url, code_name')
        .eq('user_email', session.user.email)

      if (activePlayerId) {
        query = query.eq('id', activePlayerId)
      } else {
        query = query.order('created_at', { ascending: false }).limit(1)
      }

      const { data: player } = await query.single()

      if (player) {
        session.user.playerId = player.id
        session.user.role = player.role
        session.user.playerStatus = player.status
        session.user.teamId = player.team_id
        session.user.gameId = player.game_id
        session.user.playerName = player.name
        session.user.photoUrl = player.photo_url
      }

      return session
    },
  },
  pages: {
    signIn: '/',
  },
})

// Extend next-auth types
declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null
      email?: string | null
      image?: string | null
      playerId?: string
      role?: string
      playerStatus?: string
      teamId?: string | null
      gameId?: string
      playerName?: string
      photoUrl?: string | null
    }
  }
}

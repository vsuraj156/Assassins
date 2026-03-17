import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { createServerClient } from './db'

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
      const { data: player } = await db
        .from('players')
        .select('id, role, status, team_id, game_id, name, photo_url, code_name')
        .eq('user_email', session.user.email)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

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

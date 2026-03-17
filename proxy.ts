import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isLoggedIn = !!session

  // Admin routes
  if (nextUrl.pathname.startsWith('/admin')) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL('/', nextUrl))
    }
    if (session?.user?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', nextUrl))
    }
    return NextResponse.next()
  }

  // Player-only routes
  const playerRoutes = ['/dashboard', '/target', '/checkin', '/elimination', '/leaderboard', '/log']
  const isPlayerRoute = playerRoutes.some((r) => nextUrl.pathname.startsWith(r))

  if (isPlayerRoute) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL('/', nextUrl))
    }
    if (!session?.user?.playerId) {
      // Authenticated but not in a game — redirect to signup
      return NextResponse.redirect(new URL('/signup/create-team', nextUrl))
    }
    return NextResponse.next()
  }

  // Signup routes — must be authenticated
  if (nextUrl.pathname.startsWith('/signup')) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL('/', nextUrl))
    }
    return NextResponse.next()
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*', '/target/:path*', '/checkin/:path*',
            '/elimination/:path*', '/leaderboard/:path*', '/log/:path*', '/signup/:path*'],
}

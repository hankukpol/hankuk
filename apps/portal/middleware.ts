import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.method === 'POST' && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/api/auth/login'
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/login'],
}

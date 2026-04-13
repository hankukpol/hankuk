import { NextResponse } from 'next/server'

export function handleRouteError(
  operation: string,
  fallbackMessage: string,
  error: unknown,
) {
  console.error(`${operation} failed`, error)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}

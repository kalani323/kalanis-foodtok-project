import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export async function GET() {
  try {
    const data = await redis.get('kfr_restaurants')
    return Response.json(Array.isArray(data) ? data : [])
  } catch {
    return Response.json([])
  }
}

export async function POST(request) {
  try {
    const restaurants = await request.json()
    await redis.set('kfr_restaurants', restaurants)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }
}

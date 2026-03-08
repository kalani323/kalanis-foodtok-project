import { Redis } from '@upstash/redis'

// upstash redis — serverless key-value database for cross-device persistence
// i use this so when i add a restaurant on my laptop, it shows up on my phone too
// the env vars (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN) need to be
// set in both .env.local (for local dev) and vercel's dashboard (for production)
const redis = Redis.fromEnv()

// GET — returns the full restaurant list from the database
export async function GET() {
  try {
    const data = await redis.get('kfr_restaurants')
    return Response.json(Array.isArray(data) ? data : [])
  } catch {
    // if the database is down or env vars aren't set, return empty array
    // the frontend falls back to localStorage so the app still works
    return Response.json([])
  }
}

// POST — saves the entire restaurant list to the database
// i store the whole list as a single key instead of individual records
// because the list is small and it keeps the read/write logic simple
export async function POST(request) {
  try {
    const restaurants = await request.json()
    await redis.set('kfr_restaurants', restaurants)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }
}

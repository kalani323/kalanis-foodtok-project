export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')
  const key = process.env.GOOGLE_PLACES_API_KEY

  if (!name || !key) return new Response('Not found', { status: 404 })

  const res = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxHeightPx=800&key=${key}`
  )

  return new Response(res.body, {
    headers: { 'content-type': res.headers.get('content-type') || 'image/jpeg' }
  })
}

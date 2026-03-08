// proxies google places photos so the API key stays on the server
// the frontend calls /api/photo?name=places/xxx/photos/yyy
// and this route fetches the actual image from google and streams it back

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')
  const key = process.env.GOOGLE_PLACES_API_KEY

  if (!name || !key) return new Response('Not found', { status: 404 })

  // fetch the photo from google places media endpoint
  // maxHeightPx=800 keeps the image reasonable without being too small
  const res = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxHeightPx=800&key=${key}`
  )

  // stream the response body directly back to the client
  // so we don't have to buffer the whole image in memory
  return new Response(res.body, {
    headers: { 'content-type': res.headers.get('content-type') || 'image/jpeg' }
  })
}

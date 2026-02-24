export async function POST(request) {
  const { name, location } = await request.json()
  const key = process.env.GOOGLE_PLACES_API_KEY

  if (!key) return Response.json({ photoName: null, website: null })

  try {
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.websiteUri,places.photos'
      },
      body: JSON.stringify({ textQuery: `${name} restaurant ${location}`, maxResultCount: 1 })
    })

    const searchData = await searchRes.json()
    if (!searchData.places?.length) return Response.json({ photoName: null, website: null })

    const place = searchData.places[0]
    const website = place.websiteUri || null
    const photoName = place.photos?.[0]?.name || null

    return Response.json({ photoName, website })
  } catch {
    return Response.json({ photoName: null, website: null })
  }
}

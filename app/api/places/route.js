// google places API (New) — searches for a restaurant and returns its photo, website, and rating
// this gets called right after saving a new restaurant so the card gets enriched with real data

export async function POST(request) {
  const { name, location } = await request.json()
  const key = process.env.GOOGLE_PLACES_API_KEY

  // if the API key isn't set, just return nulls — the card will still work, just without a photo
  if (!key) return Response.json({ photoName: null, website: null })

  try {
    // using the new Places API (v1) instead of the legacy one
    // the X-Goog-FieldMask header tells google which fields to return
    // — i only request what i need to keep the response small
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.websiteUri,places.photos,places.rating'
      },
      body: JSON.stringify({ textQuery: `${name} restaurant ${location}`, maxResultCount: 1 })
    })

    const searchData = await searchRes.json()
    if (!searchData.places?.length) return Response.json({ photoName: null, website: null })

    const place = searchData.places[0]
    const website = place.websiteUri || null
    // photoName is like "places/xxx/photos/yyy" — i pass it to /api/photo to proxy the image
    const photoName = place.photos?.[0]?.name || null
    const rating = place.rating || null

    return Response.json({ photoName, website, rating })
  } catch {
    return Response.json({ photoName: null, website: null, rating: null })
  }
}

import Anthropic from '@anthropic-ai/sdk'

// vercel hobby plan has a 10s default timeout — bumping this to 60s
// because even haiku can take a few seconds on larger images
export const maxDuration = 60

// these need to match the options in the frontend so claude's response
// always maps to a valid option in the dropdowns
const CUISINES = ['Italian','Japanese','Mexican','Chinese','Indian','Thai','American','Mediterranean','Korean','French','Other']
const VIBES = ['Date Night','Casual','Group Friendly','Trendy','Hidden Gem','Brunch Spot','Late Night']

export async function POST(request) {
  // make sure the API key is set — if not, it means the env var
  // wasn't added in vercel's dashboard (this got me stuck for a while)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'Missing API key' }, { status: 500 })

  // pull the image out of the form data
  let file
  try {
    const formData = await request.formData()
    file = formData.get('image')
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  if (!file) return Response.json({ error: 'No image provided' }, { status: 400 })

  // convert the uploaded file to base64 for claude's vision API
  let base64, mediaType
  try {
    const bytes = await file.arrayBuffer()
    base64 = Buffer.from(bytes).toString('base64')
    // default to jpeg if the mime type isn't one claude supports
    const type = file.type || ''
    mediaType = ['image/jpeg','image/png','image/gif','image/webp'].includes(type) ? type : 'image/jpeg'
  } catch (err) {
    console.error('Image read failed:', err.message)
    return Response.json({ error: 'Image processing failed' }, { status: 500 })
  }

  // send the image to claude haiku 4.5 for analysis
  // i switched from sonnet to haiku because sonnet was taking 15-20s
  // and vercel's hobby plan times out at 10s
  // haiku responds in 2-4s and is accurate enough for reading text from screenshots
  let message
  try {
    const client = new Anthropic({ apiKey })
    message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      // the system prompt tells claude exactly what format to respond in
      // and what fields to extract from the screenshot
      system: `You are analyzing a TikTok or Instagram screenshot to extract restaurant info. Look at ALL text: location pins, captions, hashtags, on-screen text, menus, signage, anything.

Respond with ONLY a raw JSON object (no markdown, no code fences):
{"name":"restaurant name","cuisine":"Italian|Japanese|Mexican|Chinese|Indian|Thai|American|Mediterranean|Korean|French|Other","price":"$|$$|$$$|$$$$","location":"city and state","vibe":"Date Night|Casual|Group Friendly|Trendy|Hidden Gem|Brunch Spot|Late Night","notes":"one sentence about what makes it special","confidence":"high|medium|low"}

If no restaurant is identifiable, respond with: {"error":"not found"}`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'What restaurant is featured in this screenshot? Extract all details.' }
        ]
      }]
    })
  } catch (err) {
    console.error('Anthropic API failed:', err.message)
    return Response.json({ error: 'API call failed: ' + err.message }, { status: 500 })
  }

  // parse claude's response and validate the fields
  // if claude returns a value that doesn't match our options, we fall back to defaults
  try {
    const text = message.content.find(b => b.type === 'text')?.text || ''
    // sometimes claude wraps the response in code fences even though i told it not to
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    if (parsed.error) return Response.json({ error: 'no restaurant found' }, { status: 422 })
    return Response.json({
      name: parsed.name || '',
      cuisine: CUISINES.includes(parsed.cuisine) ? parsed.cuisine : 'Other',
      price: ['$','$$','$$$','$$$$'].includes(parsed.price) ? parsed.price : '$$',
      location: parsed.location || '',
      vibe: VIBES.includes(parsed.vibe) ? parsed.vibe : 'Casual',
      notes: parsed.notes || '',
      confidence: parsed.confidence || 'medium',
    })
  } catch (err) {
    console.error('Parse failed:', err.message)
    return Response.json({ error: 'Parse failed' }, { status: 500 })
  }
}

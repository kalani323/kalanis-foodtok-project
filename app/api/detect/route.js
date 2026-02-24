import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const CUISINES = ['Italian','Japanese','Mexican','Chinese','Indian','Thai','American','Mediterranean','Korean','French','Other']
const VIBES = ['Date Night','Casual','Group Friendly','Trendy','Hidden Gem','Brunch Spot','Late Night']

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'Missing API key' }, { status: 500 })

  let file
  try {
    const formData = await request.formData()
    file = formData.get('image')
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  if (!file) return Response.json({ error: 'No image provided' }, { status: 400 })

  let base64, mediaType
  try {
    const bytes = await file.arrayBuffer()
    base64 = Buffer.from(bytes).toString('base64')
    const type = file.type || ''
    mediaType = ['image/jpeg','image/png','image/gif','image/webp'].includes(type) ? type : 'image/jpeg'
  } catch (err) {
    console.error('Image read failed:', err.message)
    return Response.json({ error: 'Image processing failed' }, { status: 500 })
  }

  let message
  try {
    const client = new Anthropic({ apiKey })
    message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
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

  try {
    const text = message.content.find(b => b.type === 'text')?.text || ''
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

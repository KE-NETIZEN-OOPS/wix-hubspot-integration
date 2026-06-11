import { saveMappings } from '../../../lib/data-access/field-mappings.js'
const VALID_DIRECTIONS = new Set(['wix_to_hs', 'hs_to_wix', 'both'])
const VALID_TRANSFORMS = new Set(['none', 'trim', 'lowercase'])
export async function POST(request) {
  try {
    const { mappings } = await request.json()
    if (!Array.isArray(mappings)) return Response.json({ error: 'Invalid mappings' }, { status: 400 })
    for (const m of mappings) {
      if (!m.wixField || !m.hubspotProperty) return Response.json({ error: 'Each mapping must have wixField and hubspotProperty' }, { status: 400 })
      if (m.direction && !VALID_DIRECTIONS.has(m.direction)) return Response.json({ error: `Invalid direction: ${m.direction}` }, { status: 400 })
      if (m.transform && !VALID_TRANSFORMS.has(m.transform)) return Response.json({ error: `Invalid transform: ${m.transform}` }, { status: 400 })
    }
    const seen = new Set()
    for (const m of mappings) {
      if (seen.has(m.hubspotProperty)) return Response.json({ error: `Duplicate HubSpot property: ${m.hubspotProperty}` }, { status: 400 })
      seen.add(m.hubspotProperty)
    }
    await saveMappings(mappings)
    return Response.json({ saved: true })
  } catch (err) {
    console.error('save-field-mappings error:', err.message)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

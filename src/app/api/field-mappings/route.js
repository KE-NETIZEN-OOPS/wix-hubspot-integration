import { getAllMappings } from '../../../lib/data-access/field-mappings.js'
import { getContactProperties } from '../../../lib/services/hubspot-client.js'
export async function GET() {
  try {
    const wixFields = ['email', 'firstName', 'lastName', 'phone']
    const [mappings, hsProps] = await Promise.all([
      getAllMappings(),
      getContactProperties().catch(() => []),
    ])
    const normalized = (mappings || []).map(m => ({ wixField: m.wix_field, hubspotProperty: m.hubspot_property, direction: m.direction, transform: m.transform }))
    return Response.json({ mappings: normalized, hsProps, wixFields })
  } catch (err) {
    console.error('field-mappings error:', err.message)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

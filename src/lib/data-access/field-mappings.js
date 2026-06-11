import { getDb } from '../db.js'
export async function getAllMappings() {
  const db = getDb()
  const { data, error } = await db.from('field_mappings').select('*')
  if (error) throw error
  return data.map(m => ({
    wixField: m.wix_field,
    hubspotProperty: m.hubspot_property,
    direction: m.direction,
    transform: m.transform,
  }))
}
export async function saveMappings(mappings) {
  const db = getDb()
  const { error: delErr } = await db.from('field_mappings').delete().not('id', 'is', null)
  if (delErr) throw delErr
  if (!mappings.length) return
  await Promise.all(mappings.map(m =>
    db.from('field_mappings').insert({ wix_field: m.wixField, hubspot_property: m.hubspotProperty, direction: m.direction || 'both', transform: m.transform || 'none' })
  ))
}
export function applyTransform(value, transform) {
  if (!value) return value
  if (transform === 'trim') return String(value).trim()
  if (transform === 'lowercase') return String(value).toLowerCase()
  return value
}

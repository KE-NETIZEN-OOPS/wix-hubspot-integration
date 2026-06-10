import wixData from 'wix-data'
const COLLECTION = 'FieldMappings'
const OPTS = { suppressAuth: true }

export async function getAllMappings() {
  const { items } = await wixData.query(COLLECTION).find(OPTS)
  return items
}

export async function saveMappings(mappings) {
  const existing = await getAllMappings()
  await Promise.all(existing.map(item => wixData.remove(COLLECTION, item._id, OPTS)))
  await Promise.all(mappings.map(m => wixData.insert(COLLECTION, m, OPTS)))
}

export function applyTransform(value, transform) {
  if (!value) return value
  if (transform === 'trim') return String(value).trim()
  if (transform === 'lowercase') return String(value).toLowerCase()
  return value
}

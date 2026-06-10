import { applyTransform } from '../data-access/field-mappings'

export function shouldSyncField(mapping, source) {
  if (mapping.direction === 'both') return true
  if (mapping.direction === 'wix_to_hs') return source === 'wix'
  if (mapping.direction === 'hs_to_wix') return source === 'hubspot'
  return false
}

export function buildSyncPayload(sourceData, mappings, source) {
  const result = {}
  for (const mapping of mappings) {
    if (!shouldSyncField(mapping, source)) continue

    const sourceKey = source === 'wix' ? mapping.wixField : mapping.hubspotProperty
    const targetKey = source === 'wix' ? mapping.hubspotProperty : mapping.wixField

    if (!(sourceKey in sourceData)) continue

    const raw = sourceData[sourceKey]
    result[targetKey] = applyTransform(raw, mapping.transform)
  }
  return result
}

export function hasChanged(currentData, incomingData) {
  return Object.entries(incomingData).some(
    ([key, val]) => currentData[key] !== val
  )
}

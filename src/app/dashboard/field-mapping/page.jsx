'use client'
import { useEffect, useState } from 'react'
const DIRECTIONS = ['both', 'wix_to_hs', 'hs_to_wix']
const TRANSFORMS = ['none', 'trim', 'lowercase']
export default function FieldMappingPage() {
  const [mappings, setMappings] = useState([])
  const [wixFields, setWixFields] = useState([])
  const [hsProps, setHsProps] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => {
    fetch('/api/field-mappings')
      .then(res => { if (!res.ok) throw new Error(); return res.json() })
      .then(data => { setMappings(data.mappings || []); setWixFields(data.wixFields || []); setHsProps(data.hsProps || []) })
      .catch(() => { setLoadFailed(true); setMessage('Failed to load mappings. Saving disabled to prevent data loss.') })
  }, [])
  function addRow() { setMappings(prev => [...prev, { wixField: '', hubspotProperty: '', direction: 'both', transform: 'none' }]) }
  function updateRow(i, key, value) { setMappings(prev => prev.map((m, idx) => idx === i ? { ...m, [key]: value } : m)) }
  function removeRow(i) { setMappings(prev => prev.filter((_, idx) => idx !== i)) }
  async function handleSave() {
    setSaving(true); setMessage(null)
    const res = await fetch('/api/save-field-mappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings }) })
    if (res.ok) { setMessage('Saved successfully.') } else { const data = await res.json().catch(() => ({})); setMessage(data.error || 'Save failed.') }
    setSaving(false)
  }
  return (
    <div>
      <h1>Field Mappings</h1>
      <p><a href="/dashboard/connect">← Back to connection</a></p>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th>Wix Field</th><th>HubSpot Property</th><th>Direction</th><th>Transform</th><th>Delete</th></tr></thead>
        <tbody>
          {mappings.map((m, i) => (
            <tr key={i}>
              <td><select value={m.wixField} onChange={e => updateRow(i, 'wixField', e.target.value)}><option value="">-- select --</option>{wixFields.map(f => <option key={f} value={f}>{f}</option>)}</select></td>
              <td><select value={m.hubspotProperty} onChange={e => updateRow(i, 'hubspotProperty', e.target.value)}><option value="">-- select --</option>{hsProps.map(p => <option key={p.name} value={p.name}>{p.label || p.name}</option>)}</select></td>
              <td><select value={m.direction} onChange={e => updateRow(i, 'direction', e.target.value)}>{DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}</select></td>
              <td><select value={m.transform} onChange={e => updateRow(i, 'transform', e.target.value)}>{TRANSFORMS.map(t => <option key={t} value={t}>{t}</option>)}</select></td>
              <td><button onClick={() => removeRow(i)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12 }}>
        <button onClick={addRow}>+ Add Row</button>{' '}
        <button onClick={handleSave} disabled={saving || loadFailed}>{saving ? 'Saving...' : 'Save Mappings'}</button>
      </div>
      {message && <p style={{ marginTop: 8 }}>{message}</p>}
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { httpClient } from '@wix/essentials'

const DIRECTIONS = [
  { value: 'both', label: '⇄ Both' },
  { value: 'wix_to_hs', label: '→ Wix only' },
  { value: 'hs_to_wix', label: '← HS only' },
]
const TRANSFORMS = ['none', 'trim', 'lowercase']

export default function FieldMappingPage() {
  const [rows, setRows] = useState([])
  const [wixFields, setWixFields] = useState([])
  const [hsProps, setHsProps] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const res = await httpClient.fetchWithAuth('/_functions/field-mappings')
      const { mappings, wixFields: wf, hsProps: hp } = await res.json()
      setWixFields(wf)
      setHsProps(hp)
      setRows(mappings.length ? mappings : [emptyRow()])
    } catch (err) {
      setError('Failed to load mappings')
      setLoadFailed(true)
    }
  }

  function emptyRow() {
    return { wixField: '', hubspotProperty: '', direction: 'both', transform: 'none' }
  }

  function updateRow(index, field, value) {
    setRows(rows.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function addRow() { setRows([...rows, emptyRow()]) }
  function removeRow(index) { setRows(rows.filter((_, i) => i !== index)) }

  async function handleSave() {
    const valid = rows.filter(r => r.wixField && r.hubspotProperty)
    const seen = new Set()
    for (const r of valid) {
      if (seen.has(r.hubspotProperty)) {
        setError(`Duplicate HubSpot property: "${r.hubspotProperty}"`)
        return
      }
      seen.add(r.hubspotProperty)
    }

    setSaving(true)
    setError(null)
    try {
      const res = await httpClient.fetchWithAuth('/_functions/save-field-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: valid }),
      })
      if (!res.ok) {
        let errMsg = 'Save failed'
        try { const d = await res.json(); errMsg = d.error || errMsg } catch {}
        throw new Error(errMsg)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Field Mappings</h1>
          <p style={styles.subtitle}>Map Wix contact fields to HubSpot properties. Changes take effect on the next sync.</p>
        </div>
        <button style={styles.btnAdd} onClick={addRow}>+ Add Mapping</button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {saved && <div style={styles.success}>Mappings saved.</div>}

      <table style={styles.table}>
        <thead>
          <tr>
            {['Wix Field', 'HubSpot Property', 'Direction', 'Transform', 'delete'].map(h => (
              <th key={h} style={styles.th}>{h === 'delete' ? '' : h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={styles.td}>
                <select style={styles.select} value={row.wixField} onChange={e => updateRow(i, 'wixField', e.target.value)}>
                  <option value="">Select field</option>
                  {wixFields.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <select style={styles.select} value={row.hubspotProperty} onChange={e => updateRow(i, 'hubspotProperty', e.target.value)}>
                  <option value="">Select property</option>
                  {hsProps.map(p => <option key={p.name} value={p.name}>{p.label} ({p.name})</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <select style={styles.select} value={row.direction} onChange={e => updateRow(i, 'direction', e.target.value)}>
                  {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <select style={styles.select} value={row.transform} onChange={e => updateRow(i, 'transform', e.target.value)}>
                  {TRANSFORMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <button style={styles.btnRemove} onClick={() => removeRow(i)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={styles.footer}>
        <button style={saving || loadFailed ? styles.btnSavingDisabled : styles.btnSave} onClick={handleSave} disabled={saving || loadFailed}>
          {saving ? 'Saving…' : 'Save Mappings'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#666', margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 16 },
  th: { background: '#f3f0ff', color: '#7c3aed', padding: '8px 10px', textAlign: 'left', border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600 },
  td: { padding: '6px 8px', border: '1px solid #e5e7eb' },
  select: { width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 },
  btnAdd: { background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 },
  btnRemove: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 },
  btnSave: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'pointer', fontSize: 14 },
  btnSavingDisabled: { background: '#a5b4fc', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'not-allowed', fontSize: 14 },
  footer: { display: 'flex', justifyContent: 'flex-end' },
  error: { background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 },
  success: { background: '#d1fae5', color: '#065f46', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 },
}

'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function payloadSummary(payload) {
  if (!payload || typeof payload !== 'object') return ''
  const keys = Object.keys(payload).filter(k => !k.startsWith('_') && k !== 'updatedAt')
  if (!keys.length) return ''
  const key = keys[0]
  const val = String(payload[key] ?? '').slice(0, 30)
  return ` · ${key} → ${val}`
}

// ─── Shared select style ─────────────────────────────────────────────────────

const selStyle = {
  background: '#0f2340',
  border: '1px solid #1e3a5f',
  color: '#c0c0c0',
  padding: '4px 6px',
  borderRadius: 4,
  fontSize: 11,
  width: '100%',
}

// ─── Tab: Connection ──────────────────────────────────────────────────────────

function ConnectionTab({ status, disconnecting, onDisconnect, onConnect }) {
  if (!status) return <p style={{ color: '#666', fontSize: 13 }}>Loading...</p>

  if (!status.connected) {
    return (
      <div style={{
        background: '#0f2340',
        border: '1px solid #1e3a5f',
        borderRadius: 12,
        padding: 32,
        textAlign: 'center',
        maxWidth: 400,
        margin: '0 auto',
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#16213e',
          border: '1px solid #1e3a5f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: 22,
        }}>🔗</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#e0e0e0', marginBottom: 8 }}>
          Connect to HubSpot
        </div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 22, lineHeight: 1.5 }}>
          Authorize this app to sync contacts between your Wix site and HubSpot CRM.
        </div>
        <button
          onClick={onConnect}
          style={{
            background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
            color: '#0a1628',
            border: 'none',
            borderRadius: 8,
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            marginBottom: 18,
          }}
        >
          ⚡ Connect HubSpot
        </button>
        <div style={{ textAlign: 'left', display: 'inline-block' }}>
          {['Read & write contacts', 'Read contact properties', 'Manage webhooks'].map(s => (
            <div key={s} style={{ color: '#666', fontSize: 11, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#444', display: 'inline-block', flexShrink: 0 }} />
              {s}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const stats = status.stats || {}
  const lastSyncDisplay = stats.lastSync
    ? relativeTime(stats.lastSync)
    : 'Never'

  const statCards = [
    { label: 'Contacts synced', value: stats.synced ?? 0 },
    { label: 'Leads captured', value: stats.leads ?? 0 },
    { label: 'Pending queue', value: stats.pending ?? 0 },
  ]

  return (
    <div>
      {/* Portal info */}
      <div style={{
        background: '#0f2340',
        border: '1px solid #1e3a5f',
        borderRadius: 8,
        padding: 14,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
          <span style={{ color: '#666' }}>Portal ID</span>
          <span style={{ fontFamily: 'monospace', color: '#e0e0e0' }}>{status.portalId}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: '#666' }}>Last sync</span>
          <span style={{ color: '#00ff88' }}>{lastSyncDisplay}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, margin: '16px 0' }}>
        {statCards.map(({ label, value }) => (
          <div key={label} style={{
            background: '#0f2340',
            border: '1px solid #1e3a5f',
            borderRadius: 8,
            padding: 12,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#00ff88' }}>{value}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Disconnect */}
      <button
        onClick={onDisconnect}
        disabled={disconnecting}
        style={{
          width: '100%',
          background: '#e74c3c11',
          color: '#e74c3c',
          border: '1px solid #e74c3c33',
          borderRadius: 8,
          padding: '10px 0',
          fontSize: 13,
          cursor: disconnecting ? 'not-allowed' : 'pointer',
          marginTop: 4,
        }}
      >
        {disconnecting ? 'Disconnecting...' : 'Disconnect HubSpot'}
      </button>
    </div>
  )
}

// ─── Tab: Field Mapping ───────────────────────────────────────────────────────

const DIRECTION_LABELS = { both: '⇄ Both', wix_to_hs: '→ Wix only', hs_to_wix: '← HS only' }

function FieldMappingTab({ mappings, setMappings, wixFields, hsProps, saving, message, loadFailed, onSave }) {
  function addRow() {
    setMappings(prev => [...prev, { wixField: '', hubspotProperty: '', direction: 'both', transform: 'none' }])
  }
  function updateRow(i, key, value) {
    setMappings(prev => prev.map((m, idx) => idx === i ? { ...m, [key]: value } : m))
  }
  function removeRow(i) {
    setMappings(prev => prev.filter((_, idx) => idx !== i))
  }

  const thStyle = {
    textAlign: 'left',
    padding: '8px 10px',
    color: '#666',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    borderBottom: '1px solid #1e3a5f',
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: '#666', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>
        Field Mappings
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={thStyle}>Wix Field</th>
            <th style={thStyle}>HubSpot Property</th>
            <th style={thStyle}>Direction</th>
            <th style={thStyle}>Transform</th>
            <th style={{ ...thStyle, width: 28 }}></th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #0f2340' }}>
              <td style={{ padding: '6px 10px' }}>
                <select value={m.wixField} onChange={e => updateRow(i, 'wixField', e.target.value)} style={selStyle}>
                  <option value="">-- select --</option>
                  {wixFields.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </td>
              <td style={{ padding: '6px 10px' }}>
                <select value={m.hubspotProperty} onChange={e => updateRow(i, 'hubspotProperty', e.target.value)} style={selStyle}>
                  <option value="">-- select --</option>
                  {hsProps.map(p => <option key={p.name} value={p.name}>{p.label || p.name}</option>)}
                </select>
              </td>
              <td style={{ padding: '6px 10px' }}>
                <select value={m.direction} onChange={e => updateRow(i, 'direction', e.target.value)} style={selStyle}>
                  {Object.entries(DIRECTION_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </td>
              <td style={{ padding: '6px 10px' }}>
                <select value={m.transform} onChange={e => updateRow(i, 'transform', e.target.value)} style={selStyle}>
                  {['none', 'trim', 'lowercase'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                <button
                  onClick={() => removeRow(i)}
                  style={{ background: 'transparent', color: '#e74c3c', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}
                >✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={addRow}
          style={{
            background: '#0f2340',
            color: '#7b8cff',
            border: '1px solid #4361ee44',
            borderRadius: 5,
            padding: '6px 12px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >+ Add Row</button>
        <button
          onClick={onSave}
          disabled={saving || loadFailed}
          style={{
            background: '#00ff8822',
            color: '#00ff88',
            border: '1px solid #00ff8844',
            borderRadius: 5,
            padding: '6px 12px',
            fontSize: 11,
            cursor: saving || loadFailed ? 'not-allowed' : 'pointer',
            opacity: saving || loadFailed ? 0.6 : 1,
          }}
        >{saving ? 'Saving...' : 'Save Mappings'}</button>
      </div>

      {message && (
        <div style={{
          fontSize: 12,
          marginTop: 8,
          color: message.toLowerCase().includes('fail') || message.toLowerCase().includes('error') ? '#e74c3c' : '#00ff88',
        }}>{message}</div>
      )}
    </div>
  )
}

// ─── Tab: Sync Log ────────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'done', label: '✓ Done' },
  { key: 'failed', label: '✗ Failed' },
  { key: 'pending', label: '⏳ Pending' },
]

function SyncLogTab({ logItems, logFilter, setLogFilter, logLoading, logError }) {
  const filtered = logFilter === 'all'
    ? logItems
    : logItems.filter(item => {
        if (logFilter === 'pending') return item.status === 'pending' || item.status === 'processing'
        return item.status === logFilter
      })

  function statusDotColor(status) {
    if (status === 'done') return '#00ff88'
    if (status === 'failed') return '#e74c3c'
    return '#f39c12'
  }

  return (
    <div>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {FILTER_OPTIONS.map(({ key, label }) => {
          const active = logFilter === key
          return (
            <button
              key={key}
              onClick={() => setLogFilter(key)}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 10,
                cursor: 'pointer',
                border: active ? '1px solid #00ff8844' : '1px solid #1e3a5f',
                color: active ? '#00ff88' : '#666',
                background: active ? '#00ff8811' : 'transparent',
              }}
            >{label}</button>
          )
        })}
      </div>

      {logLoading && <p style={{ color: '#666', fontSize: 13 }}>Loading...</p>}
      {logError && <p style={{ color: '#e74c3c', fontSize: 13 }}>{logError}</p>}

      {!logLoading && !logError && filtered.length === 0 && (
        <p style={{ color: '#666', fontSize: 13 }}>No items</p>
      )}

      {filtered.map(item => {
        const summary = `${item.event_type}${payloadSummary(item.payload)}`.slice(0, 60)
        return (
          <div key={item.id} style={{
            background: '#0f2340',
            border: '1px solid #1e3a5f',
            borderRadius: 6,
            padding: '10px 12px',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            {/* Status dot */}
            <div style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: statusDotColor(item.status),
              flexShrink: 0,
            }} />

            {/* Body */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11,
                color: '#c0c0c0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>{summary}</div>
              <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                <span style={{
                  padding: '1px 5px',
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: 600,
                  background: item.source === 'hubspot' ? '#ff7a5922' : '#00b89422',
                  color: item.source === 'hubspot' ? '#ff9a7a' : '#00d4a3',
                }}>{item.source}</span>
              </div>
              {item.error && (
                <div style={{
                  fontSize: 10,
                  color: '#e74c3c',
                  marginTop: 3,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>{item.error}</div>
              )}
            </div>

            {/* Time */}
            <div style={{ fontSize: 10, color: '#444', flexShrink: 0 }}>
              {item.created_at ? relativeTime(item.created_at) : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function DashboardInner() {
  const searchParams = useSearchParams()

  const [activeTab, setActiveTab] = useState('connection')
  const [successMsg, setSuccessMsg] = useState(null)

  // Connection state
  const [status, setStatus] = useState(null)
  const [disconnecting, setDisconnecting] = useState(false)

  // Field mapping state
  const [mappings, setMappings] = useState([])
  const [wixFields, setWixFields] = useState([])
  const [hsProps, setHsProps] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)

  // Sync log state
  const [logItems, setLogItems] = useState([])
  const [logFilter, setLogFilter] = useState('all')
  const [logLoading, setLogLoading] = useState(false)
  const [logError, setLogError] = useState(null)
  const [logFetched, setLogFetched] = useState(false)

  // ── On mount: handle ?connected=true ──
  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      setSuccessMsg('HubSpot connected successfully!')
      const t = setTimeout(() => setSuccessMsg(null), 3000)
      return () => clearTimeout(t)
    }
  }, [searchParams])

  // ── Fetch connection status ──
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/connection-status')
      const data = await res.json()
      setStatus(data)
    } catch (_) {}
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // ── Fetch field mappings on mount ──
  useEffect(() => {
    fetch('/api/field-mappings')
      .then(res => { if (!res.ok) throw new Error(); return res.json() })
      .then(data => {
        const clean = (data.mappings || []).filter(m => m.wixField && m.hubspotProperty)
        setMappings(clean)
        setWixFields(data.wixFields || [])
        setHsProps(data.hsProps || [])
      })
      .catch(() => {
        setLoadFailed(true)
        setSaveMessage('Failed to load mappings. Saving disabled to prevent data loss.')
      })
  }, [])

  // ── Lazy fetch sync log when tab first activated ──
  useEffect(() => {
    if (activeTab === 'synclog' && !logFetched) {
      setLogLoading(true)
      setLogError(null)
      fetch('/api/sync-log')
        .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
        .then(data => {
          setLogItems(data.items || [])
          setLogFetched(true)
        })
        .catch(err => setLogError(err.message || 'Failed to load sync log'))
        .finally(() => setLogLoading(false))
    }
  }, [activeTab, logFetched])

  // ── Connection handlers ──
  async function handleConnect() {
    const res = await fetch('/api/start-oauth')
    const { authUrl } = await res.json()
    window.location.href = authUrl
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect HubSpot? This will stop all syncing.')) return
    setDisconnecting(true)
    const res = await fetch('/api/disconnect', { method: 'POST' })
    if (res.ok) setStatus({ connected: false })
    setDisconnecting(false)
  }

  // ── Save mappings ──
  async function handleSave() {
    setSaving(true); setSaveMessage(null)
    const res = await fetch('/api/save-field-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings }),
    })
    if (res.ok) {
      setSaveMessage('Saved successfully.')
    } else {
      const data = await res.json().catch(() => ({}))
      setSaveMessage(data.error || 'Save failed.')
    }
    setSaving(false)
  }

  // ── Connection badge ──
  const connected = status?.connected
  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: connected ? '#00ff8811' : '#66666611',
    border: `1px solid ${connected ? '#00ff8844' : '#44444444'}`,
    color: connected ? '#00ff88' : '#666',
  }

  // ── Tabs ──
  const tabs = [
    { key: 'connection', label: 'Connection' },
    { key: 'fieldmapping', label: 'Field Mapping' },
    { key: 'synclog', label: 'Sync Log' },
  ]

  function tabStyle(key) {
    const active = activeTab === key
    return {
      padding: '10px 16px',
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      color: active ? '#00ff88' : '#666',
      background: 'transparent',
      border: 'none',
      borderBottom: active ? '2px solid #00ff88' : '2px solid transparent',
      cursor: 'pointer',
      transition: 'color 0.15s',
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>

      {/* Success banner */}
      {successMsg && (
        <div style={{
          background: '#00ff8811',
          border: '1px solid #00ff8833',
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: 16,
          color: '#00ff88',
          fontSize: 13,
        }}>{successMsg}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#00ff88',
            boxShadow: '0 0 8px #00ff88',
            flexShrink: 0,
          }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e0e0e0', letterSpacing: '0.5px' }}>
              WIX ↔ HUBSPOT
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>Integration Dashboard</div>
          </div>
        </div>
        <div style={badgeStyle}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: connected ? '#00ff88' : '#666',
          }} />
          {connected ? 'Connected' : 'Not connected'}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #1e3a5f',
        marginBottom: 20,
      }}>
        {tabs.map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={tabStyle(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{
        background: '#16213e',
        border: '1px solid #1e3a5f',
        borderRadius: 10,
        padding: 20,
      }}>
        {activeTab === 'connection' && (
          <ConnectionTab
            status={status}
            disconnecting={disconnecting}
            onDisconnect={handleDisconnect}
            onConnect={handleConnect}
          />
        )}
        {activeTab === 'fieldmapping' && (
          <FieldMappingTab
            mappings={mappings}
            setMappings={setMappings}
            wixFields={wixFields}
            hsProps={hsProps}
            saving={saving}
            message={saveMessage}
            loadFailed={loadFailed}
            onSave={handleSave}
          />
        )}
        {activeTab === 'synclog' && (
          <SyncLogTab
            logItems={logItems}
            logFilter={logFilter}
            setLogFilter={setLogFilter}
            logLoading={logLoading}
            logError={logError}
          />
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ color: '#666', padding: 20 }}>Loading...</div>}>
      <DashboardInner />
    </Suspense>
  )
}

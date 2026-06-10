import React, { useEffect, useState } from 'react'
import { dashboard } from '@wix/dashboard'
import { httpClient } from '@wix/essentials'

const STATS_POLL_MS = 30000

export default function ConnectPage() {
  const [status, setStatus] = useState({ loading: true, connected: false, portalId: null })
  const [stats, setStats] = useState({ synced: 0, leads: 0, lastSync: null })
  const [error, setError] = useState(null)

  useEffect(() => {
    checkConnection()
    const interval = setInterval(checkConnection, STATS_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  async function checkConnection() {
    try {
      const res = await httpClient.fetchWithAuth('/_functions/connection-status')
      const data = await res.json()
      setStatus({ loading: false, connected: data.connected, portalId: data.portalId })
      if (data.connected) setStats(data.stats || {})
    } catch {
      setStatus(s => ({ ...s, loading: false }))
    }
  }

  async function handleConnect() {
    try {
      const res = await httpClient.fetchWithAuth('/_functions/start-oauth')
      const { authUrl } = await res.json()
      window.location.href = authUrl
    } catch (err) {
      console.error('Connect failed:', err.message)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect HubSpot? Sync will stop immediately.')) return
    try {
      await httpClient.fetchWithAuth('/_functions/disconnect', { method: 'POST' })
      setStatus({ loading: false, connected: false, portalId: null })
    } catch (err) {
      setError('Disconnect failed. Please try again.')
    }
  }

  if (status.loading) return <div style={styles.page}><p style={styles.muted}>Loading...</p></div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>HubSpot Connection</h1>
          <p style={styles.subtitle}>Connect your HubSpot account to sync contacts and capture leads.</p>
        </div>
        <span style={status.connected ? styles.badgeConnected : styles.badgeDisconnected}>
          {status.connected ? '● Connected' : '○ Not connected'}
        </span>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {status.connected && (
        <>
          <div style={styles.statsRow}>
            <Stat label="Contacts Synced" value={stats.synced} />
            <Stat label="Leads Captured" value={stats.leads} />
            <Stat label="Last Sync" value={stats.lastSync ? timeAgo(stats.lastSync) : 'Never'} />
          </div>
          <p style={styles.portal}>Portal ID: {status.portalId}</p>
          <div style={styles.actions}>
            <button style={styles.btnDanger} onClick={handleDisconnect}>Disconnect HubSpot</button>
            <button style={styles.btnSecondary} onClick={() => dashboard.navigate({ pageId: 'field-mapping' })}>
              Field Mappings
            </button>
          </div>
        </>
      )}

      {!status.connected && (
        <button style={styles.btnPrimary} onClick={handleConnect}>Connect HubSpot</button>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

const styles = {
  page: { padding: 24, maxWidth: 640, fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#666', margin: 0 },
  badgeConnected: { background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 },
  badgeDisconnected: { background: '#f3f4f6', color: '#6b7280', padding: '4px 12px', borderRadius: 20, fontSize: 12 },
  statsRow: { display: 'flex', gap: 16, marginBottom: 16 },
  stat: { flex: 1, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', textAlign: 'center' },
  statValue: { fontSize: 22, fontWeight: 700, color: '#111' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  portal: { fontSize: 12, color: '#9ca3af', marginBottom: 16 },
  actions: { display: 'flex', gap: 10 },
  btnPrimary: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', cursor: 'pointer', fontSize: 14 },
  btnDanger: { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 },
  btnSecondary: { background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 },
  muted: { color: '#9ca3af' },
  error: { background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 },
}

'use client'
import { useEffect, useState } from 'react'
export default function ConnectPage() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState(null)
  async function fetchStatus() {
    const res = await fetch('/api/connection-status')
    const data = await res.json()
    setStatus(data)
    setLoading(false)
  }
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])
  async function handleConnect() {
    const res = await fetch('/api/start-oauth')
    const { authUrl } = await res.json()
    window.location.href = authUrl
  }
  async function handleDisconnect() {
    setDisconnecting(true)
    setError(null)
    const res = await fetch('/api/disconnect', { method: 'POST' })
    if (res.ok) {
      setStatus({ connected: false })
    } else {
      setError('Disconnect failed. Please try again.')
    }
    setDisconnecting(false)
  }
  if (loading) return <p>Loading...</p>
  return (
    <div>
      <h1>HubSpot Connection</h1>
      <p>Status: <strong style={{ color: status && status.connected ? 'green' : 'gray' }}>{status && status.connected ? 'Connected' : 'Not connected'}</strong></p>
      {status && status.connected && (
        <>
          <p>Portal ID: {status.portalId}</p>
          <p>Contacts synced: {status.stats && status.stats.synced != null ? status.stats.synced : 0}</p>
          <p>Leads captured: {status.stats && status.stats.leads != null ? status.stats.leads : 0}</p>
          <p>Last sync: {status.stats && status.stats.lastSync ? new Date(status.stats.lastSync).toLocaleString() : 'Never'}</p>
          <button onClick={handleDisconnect} disabled={disconnecting}>{disconnecting ? 'Disconnecting...' : 'Disconnect'}</button>
        </>
      )}
      {!(status && status.connected) && <button onClick={handleConnect}>Connect HubSpot</button>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <p style={{ marginTop: 24 }}><a href="/dashboard/field-mapping">Configure field mappings →</a></p>
    </div>
  )
}

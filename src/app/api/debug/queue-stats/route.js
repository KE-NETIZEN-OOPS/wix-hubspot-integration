import { getDb } from '../../../../lib/db.js'
export async function GET() {
  try {
    const db = getDb()
    const testSyncId = `debug_enqueue_test_${Date.now()}`
    // Try a direct insert to see if writes work at all
    const { error: insertErr } = await db.from('sync_queue').insert({
      sync_id: testSyncId, source: 'debug', event_type: 'debug.test',
      contact_id: 'debug', payload: {}, status: 'pending', retry_count: 0
    })
    // Immediately delete it so it doesn't pollute the queue
    if (!insertErr) await db.from('sync_queue').delete().eq('sync_id', testSyncId)

    const [{ data: pending, error: pErr }, { data: recent }, { data: log, error: lErr }, { count: logCount }] = await Promise.all([
      db.from('sync_queue').select('id,sync_id,source,status,retry_count,payload,created_at,error').eq('status', 'pending').limit(10),
      db.from('sync_queue').select('id,sync_id,source,status,retry_count,payload,created_at,error').order('created_at', { ascending: false }).limit(20),
      db.from('sync_log').select('sync_id,source,created_at').order('created_at', { ascending: false }).limit(20),
      db.from('sync_log').select('*', { count: 'exact', head: true }),
    ])
    // Test Wix GET for the known contact
    let wixContact = null
    try {
      const wixRes = await fetch('https://www.wixapis.com/contacts/v4/contacts/dc8cd5ba-7e4e-46f6-a292-7755e0074e47', {
        headers: { Authorization: process.env.WIX_API_KEY, 'wix-site-id': process.env.WIX_SITE_ID, 'wix-account-id': process.env.WIX_ACCOUNT_ID }
      })
      const wixData = await wixRes.json()
      wixContact = { status: wixRes.status, revision: wixData.contact?.revision, id: wixData.contact?.id, keys: Object.keys(wixData.contact || {}) }
    } catch (e) { wixContact = { error: e.message } }

    return Response.json({
      wixContact,
      writeTest: insertErr ? { ok: false, error: insertErr.message, code: insertErr.code } : { ok: true },
      pending: pending || [],
      pendingError: pErr?.message,
      recent: recent || [],
      log: log || [],
      logTotalCount: logCount,
      logError: lErr?.message,
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

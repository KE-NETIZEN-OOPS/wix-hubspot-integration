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
    const CONTACT_ID = 'dc8cd5ba-7e4e-46f6-a292-7755e0074e47'
    const wixHdrs = { Authorization: process.env.WIX_API_KEY, 'wix-site-id': process.env.WIX_SITE_ID, 'wix-account-id': process.env.WIX_ACCOUNT_ID, 'Content-Type': 'application/json' }
    // Test Wix GET for the known contact
    let wixContact = null, patchTest = null
    try {
      const wixRes = await fetch(`https://www.wixapis.com/contacts/v4/contacts/${CONTACT_ID}`, { headers: wixHdrs })
      const wixData = await wixRes.json()
      const revision = wixData.contact?.revision
      wixContact = { status: wixRes.status, revision, revisionType: typeof revision, id: wixData.contact?.id }
      // Test PATCH with body matching exactly what sync worker sends
      const patchBody = { contact: { info: { name: { first: 'Debug', last: 'Test' } } }, revision: String(revision || '1') }
      const patchRes = await fetch(`https://www.wixapis.com/contacts/v4/contacts/${CONTACT_ID}`, {
        method: 'PATCH', headers: wixHdrs, body: JSON.stringify(patchBody)
      })
      const patchData = await patchRes.json()
      patchTest = { status: patchRes.status, body: JSON.stringify(patchBody), response: JSON.stringify(patchData).slice(0, 300) }
    } catch (e) { wixContact = { error: e.message } }

    return Response.json({
      wixContact,
      patchTest,
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

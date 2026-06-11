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
      db.from('sync_queue').select('id,sync_id,source,status,retry_count,created_at,error').eq('status', 'pending').limit(10),
      db.from('sync_queue').select('id,sync_id,source,status,retry_count,created_at,error').order('created_at', { ascending: false }).limit(20),
      db.from('sync_log').select('sync_id,source,created_at').order('created_at', { ascending: false }).limit(20),
      db.from('sync_log').select('*', { count: 'exact', head: true }),
    ])
    return Response.json({
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

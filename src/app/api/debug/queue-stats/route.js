import { getDb } from '../../../../lib/db.js'
export async function GET() {
  try {
    const db = getDb()
    const [{ data: pending }, { data: recent }, { data: log }, { count: logCount }] = await Promise.all([
      db.from('sync_queue').select('id,sync_id,source,status,retry_count,payload,created_at,error').eq('status', 'pending').limit(10),
      db.from('sync_queue').select('id,sync_id,source,status,retry_count,payload,created_at,error').order('created_at', { ascending: false }).limit(20),
      db.from('sync_log').select('sync_id,source,created_at').order('created_at', { ascending: false }).limit(20),
      db.from('sync_log').select('*', { count: 'exact', head: true }),
    ])
    return Response.json({ pending: pending || [], recent: recent || [], log: log || [], logTotalCount: logCount })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

import { getDb } from '../../../../lib/db.js'
export async function GET() {
  try {
    const db = getDb()
    const [{ data: pending }, { data: recent }, { data: log }] = await Promise.all([
      db.from('sync_queue').select('id,sync_id,source,status,created_at,error').eq('status', 'pending').limit(10),
      db.from('sync_queue').select('id,sync_id,source,status,created_at,error').order('created_at', { ascending: false }).limit(10),
      db.from('sync_log').select('sync_id,source,created_at').order('created_at', { ascending: false }).limit(5),
    ])
    return Response.json({ pending: pending || [], recent: recent || [], log: log || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

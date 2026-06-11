import { getDb } from '../../../lib/db.js'
export async function GET() {
  try {
    const db = getDb()
    const { data, error } = await db
      .from('sync_queue')
      .select('id,sync_id,source,event_type,status,retry_count,payload,created_at,error')
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) throw error
    return Response.json({ items: data || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

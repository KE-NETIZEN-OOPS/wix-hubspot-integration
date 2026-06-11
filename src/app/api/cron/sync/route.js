import { processSyncQueue } from '../../../../lib/jobs/sync-worker.js'
export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await processSyncQueue()
    return Response.json({ ok: true })
  } catch (err) {
    console.error('Cron sync error:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

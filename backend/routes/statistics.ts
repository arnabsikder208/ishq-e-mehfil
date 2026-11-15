import { Router, Response } from 'express';
import { tickets } from '../db';

export interface Stats { total: number; verified: number; remaining: number; updatedAt: string }

export async function getStats(): Promise<Stats> {
  const [total, verified] = await Promise.all([
    tickets().countDocuments({}),
    tickets().countDocuments({ isVerified: true }),
  ]);
  return { total, verified, remaining: total - verified, updatedAt: new Date().toISOString() };
}

const clients = new Set<Response>();
let last = '';

export async function broadcastStats(force = false) {
  if (!clients.size) return;
  try {
    const s = await getStats();
    const key = `${s.total}/${s.verified}`;
    if (!force && key === last) return;
    last = key;
    for (const c of clients) c.write(`event: stats\ndata: ${JSON.stringify(s)}\n\n`);
  } catch { /* db down: clients keep last values and show offline state */ }
}
// Safety net so a second server instance or direct DB edits still propagate.
setInterval(() => broadcastStats(), 4000).unref();

const router = Router();

router.get('/stats', async (_req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await getStats()); }
  catch { res.status(503).json({ status: 'error', message: 'Database unavailable.' }); }
});

router.get('/stats/stream', async (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  clients.add(res);
  const hb = setInterval(() => res.write(': hb\n\n'), 20000);
  req.on('close', () => { clearInterval(hb); clients.delete(res); });
  try { res.write(`event: stats\ndata: ${JSON.stringify(await getStats())}\n\n`); } catch { /* ignore */ }
});

export default router;

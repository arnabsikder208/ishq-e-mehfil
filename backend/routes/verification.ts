import { Router } from 'express';
import { tickets, history } from '../db';
import { config } from '../config';
import { normalizeSerial, Ticket } from '../models/Ticket';
import { requireStaff } from '../middleware/staff';
import { broadcastStats, getStats } from './statistics';

const router = Router();
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, day: '2-digit', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: config.timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

function view(t: Ticket) {
  return {
    serialNo: t.serialNo, name: t.name, phone: t.phone,
    verifiedAt: t.verifiedAt ? t.verifiedAt.toISOString() : null,
    verifiedDate: t.verifiedAt ? dateFmt.format(t.verifiedAt) : null,
    verifiedTime: t.verifiedAt ? timeFmt.format(t.verifiedAt) + ' (BST)' : null,
    verifiedBy: t.verifiedBy, verifiedByName: t.verifiedBy ? config.staff[t.verifiedBy] || t.verifiedBy : null,
  };
}

router.post('/verify', requireStaff, async (req, res) => {
  const serialNo = normalizeSerial(req.body?.serialNo);
  if (!serialNo) return res.status(400).json({ status: 'error', message: 'Enter a numeric serial number.' });
  const staffId = (req as any).staffId as string;
  try {
    // ATOMIC: matches only if still unverified. Of two simultaneous requests exactly one gets a document back.
    const won = await tickets().findOneAndUpdate(
      { serialNo, isVerified: false },
      { $set: { isVerified: true, verifiedAt: new Date(), verifiedBy: staffId } },
      { returnDocument: 'after' }
    );
    if (won) {
      try {
        await history().updateOne(
          { serialNo },
          { $setOnInsert: { serialNo, name: won.name, verifiedAt: won.verifiedAt!, verifiedBy: staffId } },
          { upsert: true }
        );
      } catch (e) { console.error('History write failed for', serialNo, e); }
      broadcastStats(true);
      return res.json({ status: 'verified', ticket: view(won), stats: await getStats().catch(() => null) });
    }
    const existing = await tickets().findOne({ serialNo });
    if (existing) return res.json({ status: 'already_verified', ticket: view(existing) });
    return res.json({ status: 'invalid', serialNo });
  } catch (e) {
    console.error('Verify failed', e);
    return res.status(503).json({ status: 'error', message: 'Database unavailable. Ticket was NOT verified.' });
  }
});

export default router;

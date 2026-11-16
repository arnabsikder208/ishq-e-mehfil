import express from 'express';
import cors from 'cors';
import path from 'path';
import { Redis } from '@upstash/redis';
import { tickets, connectDB } from './db';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'frontend')));

// Automatically detect whichever Redis env var names Vercel injected
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
if (redisUrl && redisToken) {
  try {
    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
  } catch (e) {
    console.error('Failed to initialize Redis:', e);
  }
}

interface VerifiedRecord {
  verifiedDate: string;
  verifiedTime: string;
  verifiedByName: string;
}
// Helper: Fetch all permanently verified tickets from Redis (or local memory fallback)
const localMemoryStore: Record<string, VerifiedRecord> = {};

async function getVerifiedMap(): Promise<Record<string, VerifiedRecord>> {
  if (redis) {
    const data = await redis.get<Record<string, VerifiedRecord>>('verified_tickets');
    return data || {};
  }
  return localMemoryStore;
}

async function saveVerifiedRecord(serialNo: string, record: VerifiedRecord): Promise<void> {
  if (redis) {
    const current = await getVerifiedMap();
    current[serialNo] = record;
    await redis.set('verified_tickets', current);
  } else {
    localMemoryStore[serialNo] = record;
  }
}

// 1. Verify Ticket endpoint
app.post('/api/verify', async (req, res) => {
  try {
    const rawSerial = String(req.body.serialNo || '').trim().toUpperCase();
    const ticket = tickets.find(
      (t) => t.serialNo?.toUpperCase() === rawSerial || t.id.toUpperCase() === rawSerial
    );

    if (!ticket) {
      return res.status(200).json({
        status: 'invalid',
        message: 'Give the correct serial',
      });
    }

    const canonicalSerial = (ticket.serialNo || ticket.id).toUpperCase();
    const verifiedMap = await getVerifiedMap();

    // Calculate multi-ticket details across persistent records
    const samePersonTickets = tickets.filter(
      (t) => t.name.toLowerCase() === ticket.name.toLowerCase()
    );
    const totalOwned = samePersonTickets.length;
    const usedOwned = samePersonTickets.filter((t) => {
      const code = (t.serialNo || t.id).toUpperCase();
      return !!verifiedMap[code];
    }).length;

    // Check if already verified
    if (verifiedMap[canonicalSerial]) {
      const existing = verifiedMap[canonicalSerial];
      return res.status(200).json({
        status: 'already_verified',
        ticket: {
          ...ticket,
          serialNo: canonicalSerial,
          status: 'used',
          ...existing,
          multiInfo: totalOwned > 1 ? `${totalOwned} total passes (${usedOwned} used)` : undefined,
        },
        stats: computeStats(verifiedMap),
      });
    }

    // Format exact Dhaka, Bangladesh Time
    const now = new Date();
    const record: VerifiedRecord = {
      verifiedDate: now.toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka' }),
      verifiedTime: now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }),
      verifiedByName: 'Gate Staff',
    };

    // Save permanently to Redis
    await saveVerifiedRecord(canonicalSerial, record);
    verifiedMap[canonicalSerial] = record;

    return res.status(200).json({
      status: 'verified',
      ticket: {
        ...ticket,
        serialNo: canonicalSerial,
        status: 'used',
        ...record,
        multiInfo:
          totalOwned > 1
            ? `${totalOwned} total passes (${usedOwned + 1}/${totalOwned} now used)`
            : undefined,
      },
      stats: computeStats(verifiedMap),
    });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ status: 'error', message: 'Database connection error.' });
  }
});

// 2. Get Stats endpoint
app.get('/api/stats', async (req, res) => {
  const verifiedMap = await getVerifiedMap();
  res.json(computeStats(verifiedMap));
});

// 3. Stats Stream (SSE) endpoint
app.get('/api/stats/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendStats = async () => {
    const verifiedMap = await getVerifiedMap();
    res.write(`event: stats\ndata: ${JSON.stringify(computeStats(verifiedMap))}\n\n`);
  };

  await sendStats();
  const interval = setInterval(sendStats, 5000);
  req.on('close', () => clearInterval(interval));
});

function computeStats(verifiedMap: Record<string, VerifiedRecord>) {
  const total = tickets.length;
  const verified = tickets.filter((t) => {
    const code = (t.serialNo || t.id).toUpperCase();
    return !!verifiedMap[code];
  }).length;
  const remaining = total - verified;
  return { total, verified, remaining };
}

if (!process.env.VERCEL) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}

export default app;

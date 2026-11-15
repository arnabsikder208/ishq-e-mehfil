// backend/server.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import { tickets, connectDB } from './db';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files reliably on Vercel and locally
app.use(express.static(path.join(process.cwd(), 'frontend')));

// 1. Verify Ticket endpoint
app.post('/api/verify', (req, res) => {
  const { serialNo } = req.body;
  
  const ticket = tickets.find(t => t.id === serialNo || t.serialNo === serialNo);

  if (!ticket) {
    return res.status(200).json({
      status: 'invalid',
      message: 'Give the correct serial'
    });
  }

  ticket.serialNo = ticket.serialNo || ticket.id;

  const samePersonTickets = tickets.filter(t => t.name.toLowerCase() === ticket.name.toLowerCase());
  const totalOwned = samePersonTickets.length;
  const usedOwned = samePersonTickets.filter(t => t.status === 'used').length;

  const ticketResponse = {
    ...ticket,
    multiInfo: totalOwned > 1 ? `${totalOwned} total passes (${usedOwned} used)` : undefined
  };

  if (ticket.status === 'used') {
    return res.status(200).json({
      status: 'already_verified',
      ticket: ticketResponse,
      stats: getStats()
    });
  }

  ticket.status = 'used';
  ticket.verifiedDate = new Date().toLocaleDateString();
  ticket.verifiedTime = new Date().toLocaleTimeString();
  ticket.verifiedByName = 'Gate Staff';

  return res.status(200).json({
    status: 'verified',
    ticket: {
      ...ticket,
      multiInfo: totalOwned > 1 ? `${totalOwned} total passes (${usedOwned + 1}/${totalOwned} now used)` : undefined
    },
    stats: getStats()
  });
});

// 2. Get Stats endpoint
app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

// 3. Stats Stream (SSE) endpoint
app.get('/api/stats/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendStats = () => {
    res.write(`event: stats\ndata: ${JSON.stringify(getStats())}\n\n`);
  };

  const interval = setInterval(sendStats, 5000);
  req.on('close', () => clearInterval(interval));
});

function getStats() {
  const total = tickets.length;
  const verified = tickets.filter(t => t.status === 'used').length;
  const remaining = total - verified;
  return { total, verified, remaining };
}

// Only run local listener if not in Vercel production environment
if (!process.env.VERCEL) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}

export default app;

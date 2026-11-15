import fs from 'fs';
import path from 'path';
import { connectDb, parseTicketText, importTickets } from '../db';

(async () => {
  const file = path.resolve(process.argv[2] || 'data/tickets.csv');
  if (!fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
  await connectDb();
  const { rows, invalidLines } = parseTicketText(fs.readFileSync(file, 'utf8'));
  const r = await importTickets(rows, invalidLines);
  console.log(`Read ${rows.length} rows from ${file}`);
  console.log(`  Inserted new tickets : ${r.inserted}`);
  console.log(`  Already in database  : ${r.alreadyExisting} (left untouched, verification kept)`);
  console.log(`  Duplicate serials in file (skipped): ${r.duplicatesInFile.length ? r.duplicatesInFile.join(', ') : 'none'}`);
  console.log(`  Invalid lines (skipped): ${r.invalidLines.length}`);
  r.invalidLines.forEach((l) => console.log('    ' + l));
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });

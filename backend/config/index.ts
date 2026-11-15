import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || '',
  dbName: process.env.DB_NAME || 'ishq_e_mehfil',
  corsOrigin: process.env.CORS_ORIGIN || '',
  gatePasscode: process.env.GATE_PASSCODE || '',
  staff: { 'staff-1': 'Entry Gate Staff 1', 'staff-2': 'Entry Gate Staff 2' } as Record<string, string>,
  timeZone: 'Asia/Dhaka',
};

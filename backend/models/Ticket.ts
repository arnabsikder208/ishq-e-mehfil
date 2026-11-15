import { Collection } from 'mongodb';

export interface Ticket {
  serialNo: string;
  name: string;
  phone: string;
  isVerified: boolean;
  verifiedAt: Date | null;
  verifiedBy: string | null;
}

export interface VerificationRecord {
  serialNo: string;
  name: string;
  verifiedAt: Date;
  verifiedBy: string;
}

export type TicketCollection = Collection<Ticket>;
export type HistoryCollection = Collection<VerificationRecord>;

/** "007" -> "7". Serials are numeric; leading zeros are ignored so "07" and "7" match. */
export function normalizeSerial(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/\s+/g, '');
  if (!/^\d{1,12}$/.test(s)) return null;
  return s.replace(/^0+(?=\d)/, '');
}

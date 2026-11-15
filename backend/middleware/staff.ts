import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  const id = String(req.header('x-staff-id') || '');
  if (!config.staff[id]) return res.status(401).json({ status: 'error', message: 'Select a valid staff identity.' });
  if (config.gatePasscode && req.header('x-gate-passcode') !== config.gatePasscode)
    return res.status(401).json({ status: 'error', message: 'Wrong gate passcode.' });
  (req as any).staffId = id;
  next();
}

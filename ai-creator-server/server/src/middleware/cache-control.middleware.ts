import { Request, Response, NextFunction } from 'express';

export function privateNoStore(req: Request, res: Response, next: NextFunction): void {
  if (req.user && !res.headersSent) {
    res.setHeader('Cache-Control', 'private, no-store');
  }
  next();
}

export function cacheFor(seconds: number, options: { publicWithAuth?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!options.publicWithAuth && req.headers.authorization) {
      res.setHeader('Cache-Control', 'private, no-store');
      next();
      return;
    }
    res.setHeader('Cache-Control', `public, max-age=${seconds}`);
    next();
  };
}

import { Response } from 'express';

export function sendRouteError(res: Response, error: any, fallbackMessage: string) {
  const statusCode = error?.statusCode || error?.status || error?.response?.status || 500;
  const retryAfterSeconds = error?.retryAfterSeconds;

  if (retryAfterSeconds) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
  }

  res.status(statusCode).json({
    error: statusCode === 429 && error?.message ? error.message : fallbackMessage,
  });
}

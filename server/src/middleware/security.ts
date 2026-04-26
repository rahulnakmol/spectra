import helmet from 'helmet';
import type { RequestHandler } from 'express';

export function securityHeaders(): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          frameSrc: ['https://*.sharepoint.com'],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xDownloadOptions: true,
      noSniff: true,
    }),
    (_req, res, next) => {
      res.setHeader(
        'Permissions-Policy',
        'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
      );
      next();
    },
  ];
}

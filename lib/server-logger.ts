import 'server-only';

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

export const serverLogger = pino({
  level: process.env.LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info'),
  redact: {
    paths: [
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      'cookie',
      'password',
      'token',
      'x-api-secret',
      'x-internal-secret',
      '*.authorization',
      '*.cookie',
      '*.*.authorization',
    ],
    censor: '[Redacted]',
  },
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
      }
    : {}),
});

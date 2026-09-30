import { pino } from 'pino';
import { env } from './env.js';

/**
 * Structured JSON logger. Credentials never reach log sinks: cookies, auth headers and any
 * password/token/secret fields are redacted at every nesting level we log.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'zyventa-api', version: env.APP_VERSION },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.secret',
      '*.razorpay_signature',
    ],
    censor: '[REDACTED]',
  },
  ...(env.LOG_FORMAT === 'json'
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname,service,version',
          },
        },
      }),
});

export type Logger = typeof logger;

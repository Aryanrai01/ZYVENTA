// Request augmentation. `req.id` (correlation id) is already typed by pino-http.
import type { AuthPrincipal } from '../modules/auth/principal.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware; absent for anonymous requests. */
      auth?: AuthPrincipal;
      /**
       * Output of the `validate()` middleware. Express 5 makes `req.query` a read-only getter,
       * so parsed + coerced input is stored here rather than written back onto the request.
       */
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

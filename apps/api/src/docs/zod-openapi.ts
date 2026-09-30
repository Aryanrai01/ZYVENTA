import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Adds `.openapi()` to zod schemas (needed for named components). Import before building docs.
extendZodWithOpenApi(z);

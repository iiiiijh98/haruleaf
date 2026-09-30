import { z } from 'zod';

export const PLATFORM_HEADER = 'x-client-platform';

export const platformSchema = z.enum(['ios', 'web']);

export type Platform = z.infer<typeof platformSchema>;

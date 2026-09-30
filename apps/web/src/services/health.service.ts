import type { ReadinessReport } from '@zyventa/shared';
import { ApiClientError, apiClient } from '@/lib/api-client';

export type SystemStatus =
  { reachable: true; report: ReadinessReport } | { reachable: false; reason: string };

export const healthService = {
  /** Readiness of the API and its dependencies. Never cached — always a live check. */
  async getStatus(): Promise<SystemStatus> {
    try {
      const { data } = await apiClient.get<ReadinessReport>('/health/ready', { cache: 'no-store' });
      return { reachable: true, report: data };
    } catch (error) {
      return {
        reachable: false,
        reason: error instanceof ApiClientError ? error.message : 'Unknown error',
      };
    }
  },
};

import { useState, useCallback } from 'react';
import { AimsApiClient } from '@/src/aims/apiClient';
import type { NormalizedRoster } from '@/src/core/rosterContract';
import { importNormalizedRoster } from '@/src/application';

interface UseAimsScheduleOptions {
  apiBaseUrl?: string;
  username: string;
  password: string;
}

interface UseAimsScheduleState {
  loading: boolean;
  error: string | null;
  roster: NormalizedRoster | null;
  lastFetch: Date | null;
}

/**
 * Hook for fetching and managing AIMS schedule via backend API
 *
 * Usage:
 * ```tsx
 * const { roster, loading, error, fetchSchedule } = useAimsSchedule({
 *   username: 'your_username',
 *   password: 'your_password'
 * });
 *
 * useEffect(() => {
 *   fetchSchedule('2026-09-03', '2026-09-10');
 * }, []);
 * ```
 */
export function useAimsSchedule(options: UseAimsScheduleOptions) {
  const [state, setState] = useState<UseAimsScheduleState>({
    loading: false,
    error: null,
    roster: null,
    lastFetch: null
  });

  const fetchSchedule = useCallback(
    async (startDate: string, endDate: string) => {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null
      }));

      try {
        const client = new AimsApiClient(
          options.apiBaseUrl || 'http://localhost:8000',
          options.username,
          options.password
        );

        const roster = await client.getRoster(startDate, endDate);

        // Save to local storage
        importNormalizedRoster(roster);

        setState({
          loading: false,
          error: null,
          roster,
          lastFetch: new Date()
        });

        return roster;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error occurred';

        setState({
          loading: false,
          error: errorMessage,
          roster: null,
          lastFetch: null
        });

        throw err;
      }
    },
    [options]
  );

  const refetch = useCallback(
    (startDate: string, endDate: string) => {
      return fetchSchedule(startDate, endDate);
    },
    [fetchSchedule]
  );

  return {
    ...state,
    fetchSchedule,
    refetch
  };
}

/**
 * Hook to check API connectivity
 */
export function useAimsApiStatus(apiBaseUrl: string = 'http://localhost:8000') {
  const [isHealthy, setIsHealthy] = useState(true);
  const [checking, setChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      setIsHealthy(response.ok);
    } catch {
      setIsHealthy(false);
    } finally {
      setChecking(false);
    }
  }, [apiBaseUrl]);

  return { isHealthy, checking, checkHealth };
}

import { useEffect, useCallback, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';

export const useSessionPolling = (sessionId, interval = 3000) => {
  const pollingRef = useRef(null);
  const { updateSessionFromPoll } = useSessionStore();

  const pollSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/sessions/${sessionId}/status`);
      if (response.ok) {
        const data = await response.json();
        updateSessionFromPoll(data);
      }
    } catch (error) {
      console.error('Session polling error:', error);
    }
  }, [sessionId, updateSessionFromPoll]);

  useEffect(() => {
    if (!sessionId) return;

    // Initial poll
    pollSession();

    // Set up interval
    pollingRef.current = setInterval(pollSession, interval);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [sessionId, interval, pollSession]);

  return { pollSession };
};

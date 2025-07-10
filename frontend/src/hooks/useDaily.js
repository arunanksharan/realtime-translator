import { useState, useEffect, useCallback, useRef } from 'react';
import DailyIframe from '@daily-co/daily-js';

const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

export const useDaily = ({ roomUrl, token, userName }) => {
  const [daily, setDaily] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [participants, setParticipants] = useState({});
  
  const dailyRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  // Manual retry function
  const manualRetry = useCallback(() => {
    setError(null);
    setRetryCount(0);
    connect();
  }, []);

  // Connection function with retry logic
  const connect = useCallback(async () => {
    if (!roomUrl || !token) {
      setError('Missing room URL or token');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Create Daily instance
      const callObject = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
        dailyConfig: {
          experimentalChromeVideoMuteLightOff: true,
        },
      });

      dailyRef.current = callObject;

      // Set up event listeners
      callObject.on('joined-meeting', handleJoinedMeeting);
      callObject.on('participant-joined', handleParticipantJoined);
      callObject.on('participant-left', handleParticipantLeft);
      callObject.on('error', handleError);
      callObject.on('network-quality-change', handleNetworkQualityChange);
      callObject.on('active-speaker-change', handleActiveSpeakerChange);

      // Join the room
      await callObject.join({
        url: roomUrl,
        token: token,
        userName: userName || 'User',
      });

      setDaily(callObject);
      setIsConnected(true);
      setIsConnecting(false);
      setRetryCount(0); // Reset retry count on successful connection

    } catch (err) {
      console.error('Daily connection error:', err);
      setIsConnecting(false);
      handleConnectionError(err);
    }
  }, [roomUrl, token, userName]);

  // Handle connection errors with retry logic
  const handleConnectionError = useCallback((err) => {
    const errorMessage = err.message || 'Failed to connect to Daily room';
    setError(errorMessage);

    if (retryCount < MAX_RETRY_ATTEMPTS) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
      console.log(`Retrying connection in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);
      
      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        connect();
      }, delay);
    } else {
      setError(`${errorMessage} (Max retries reached)`);
    }
  }, [retryCount, connect]);

  // Event handlers
  const handleJoinedMeeting = useCallback((evt) => {
    console.log('Joined meeting:', evt);
    setParticipants(evt.participants);
  }, []);

  const handleParticipantJoined = useCallback((evt) => {
    console.log('Participant joined:', evt);
    setParticipants(prev => ({
      ...prev,
      [evt.participant.session_id]: evt.participant,
    }));
  }, []);

  const handleParticipantLeft = useCallback((evt) => {
    console.log('Participant left:', evt);
    setParticipants(prev => {
      const updated = { ...prev };
      delete updated[evt.participant.session_id];
      return updated;
    });
  }, []);

  const handleError = useCallback((evt) => {
    console.error('Daily error event:', evt);
    if (evt.errorMsg?.includes('network') || evt.errorMsg?.includes('connection')) {
      handleConnectionError(new Error(evt.errorMsg));
    } else {
      setError(evt.errorMsg || 'An error occurred');
    }
  }, [handleConnectionError]);

  const handleNetworkQualityChange = useCallback((evt) => {
    console.log('Network quality change:', evt);
    // Could trigger UI updates based on network quality
  }, []);

  const handleActiveSpeakerChange = useCallback((evt) => {
    console.log('Active speaker change:', evt);
    // Could update UI to show who's speaking
  }, []);

  // Leave meeting
  const leave = useCallback(async () => {
    if (dailyRef.current) {
      try {
        await dailyRef.current.leave();
        await dailyRef.current.destroy();
      } catch (err) {
        console.error('Error leaving meeting:', err);
      }
      
      dailyRef.current = null;
      setDaily(null);
      setIsConnected(false);
      setParticipants({});
    }
  }, []);

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (dailyRef.current) {
      const localParticipant = dailyRef.current.participants().local;
      await dailyRef.current.setLocalAudio(!localParticipant.audio);
    }
  }, []);

  // Get local participant
  const getLocalParticipant = useCallback(() => {
    if (dailyRef.current) {
      return dailyRef.current.participants().local;
    }
    return null;
  }, []);

  // Initialize connection
  useEffect(() => {
    if (roomUrl && token) {
      connect();
    }

    return () => {
      // Cleanup on unmount
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      leave();
    };
  }, [roomUrl, token]); // Don't include connect/leave to avoid loops

  return {
    daily,
    isConnecting,
    isConnected,
    error,
    participants,
    retryCount,
    maxRetries: MAX_RETRY_ATTEMPTS,
    leave,
    toggleAudio,
    getLocalParticipant,
    manualRetry,
  };
};

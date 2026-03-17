'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { quizApi } from '../api/quiz';
import { ViolationType } from '../types/quiz';

interface UseSafeExamReturn {
  showWarning: boolean;
  isDisqualified: boolean;
  lastViolationType: ViolationType | null;
  acknowledgeWarning: () => void;
  enterFullscreen: () => void;
}

export function useSafeExam(quizId: number, isActive: boolean = true): UseSafeExamReturn {
  const [showWarning, setShowWarning] = useState(false);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [lastViolationType, setLastViolationType] = useState<ViolationType | null>(null);

  // Prevent multiple simultaneous violation reports
  const isReportingRef = useRef(false);
  // Track if quiz is still active (not completed/disqualified)
  const isActiveRef = useRef(isActive);

  useEffect(() => {
    isActiveRef.current = isActive && !isDisqualified;
  }, [isActive, isDisqualified]);

  const enterFullscreen = useCallback(() => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // Ignore errors (e.g. user denied fullscreen)
      });
    }
  }, []);

  const handleViolation = useCallback(async (type: ViolationType) => {
    if (!isActiveRef.current || isReportingRef.current) return;

    isReportingRef.current = true;
    setLastViolationType(type);

    try {
      const result = await quizApi.reportViolation(quizId, type);

      if (result.is_disqualified) {
        setIsDisqualified(true);
        setShowWarning(false);
      } else if (result.is_warning) {
        setShowWarning(true);
      }
    } catch (err) {
      // If API call fails, still show warning UI to prevent cheating
      setShowWarning(true);
    } finally {
      isReportingRef.current = false;
    }
  }, [quizId]);

  const acknowledgeWarning = useCallback(() => {
    setShowWarning(false);
    enterFullscreen();
  }, [enterFullscreen]);

  // Attach/remove event listeners
  useEffect(() => {
    if (!isActive || isDisqualified) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isActiveRef.current) {
        handleViolation('fullscreen_exit');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && isActiveRef.current) {
        handleViolation('tab_switch');
      }
    };

    const handleWindowBlur = () => {
      if (isActiveRef.current) {
        handleViolation('tab_switch');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActiveRef.current) return;

      // Ctrl+C or Cmd+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleViolation('copy');
        return;
      }
      // Ctrl+V or Cmd+V
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handleViolation('paste');
        return;
      }
      // Ctrl+A or Cmd+A
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleViolation('select_all');
        return;
      }
      // PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        handleViolation('print_screen');
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (!isActiveRef.current) return;
      e.preventDefault();
      handleViolation('right_click');
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isActive, isDisqualified, handleViolation]);

  return {
    showWarning,
    isDisqualified,
    lastViolationType,
    acknowledgeWarning,
    enterFullscreen,
  };
}

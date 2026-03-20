'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Shield, AlertTriangle, Maximize } from 'lucide-react';

interface Props {
  enabled: boolean;
  isSubmitted: boolean;
  children: React.ReactNode;
  onViolation?: (type: string) => void;
}

export function SafeExamWrapper({ enabled, isSubmitted, children, onViolation }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [violations, setViolations] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMsg, setWarningMsg] = useState('');
  const violationRef = useRef(0);

  const triggerViolation = useCallback((msg: string, type: string) => {
    if (isSubmitted) return;
    violationRef.current += 1;
    setViolations(v => v + 1);
    setWarningMsg(msg);
    setShowWarning(true);
    onViolation?.(type);
    setTimeout(() => setShowWarning(false), 4000);
  }, [isSubmitted, onViolation]);

  const enterFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || isSubmitted) return;

    enterFullscreen();

    const onFsChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs && !isSubmitted) {
        triggerViolation('⚠️ Plein écran requis pour ce TP. Cliquez pour revenir.', 'fullscreen_exit');
      }
    };

    const blockCopy = (e: KeyboardEvent) => {
      if (!enabled || isSubmitted) return;
      const key = e.key.toLowerCase();
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && (key === 'c' || key === 'v' || key === 'x' || key === 'a')) {
        if (key === 'a' && (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (key === 'c') triggerViolation('❌ Copier est désactivé en mode examen.', 'copy');
        if (key === 'v') triggerViolation('❌ Coller est désactivé en mode examen.', 'paste');
        if (key === 'x') triggerViolation('❌ Couper est désactivé en mode examen.', 'cut');
      }
      if (['f12', 'f5'].includes(key)) e.preventDefault();
    };

    const blockCtxMenu = (e: MouseEvent) => {
      if (!isSubmitted) e.preventDefault();
    };

    const onVisChange = () => {
      if (document.hidden && !isSubmitted) {
        triggerViolation('⚠️ Changement d\'onglet détecté ! Restez sur cette page pendant l\'examen.', 'tab_switch');
      }
    };

    const onBlur = () => {
      if (!isSubmitted) {
        triggerViolation('⚠️ Vous avez quitté la fenêtre d\'examen.', 'window_blur');
      }
    };

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('keydown', blockCopy);
    document.addEventListener('contextmenu', blockCtxMenu);
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('keydown', blockCopy);
      document.removeEventListener('contextmenu', blockCtxMenu);
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('blur', onBlur);
      if (document.fullscreenElement) document.exitFullscreen?.();
    };
  }, [enabled, isSubmitted, triggerViolation, enterFullscreen]);

  if (!enabled) return <>{children}</>;

  return (
    <div className="relative min-h-screen">
      {!isSubmitted && (
        <div className="sticky top-0 z-50 bg-rose-900 text-white px-4 py-2 flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />
            <span>🔒 Mode Examen Sécurisé — Sommative</span>
          </div>
          <div className="flex items-center gap-4">
            {violations > 0 && (
              <span className="text-rose-200">⚠️ {violations} violation{violations > 1 ? 's' : ''} détectée{violations > 1 ? 's' : ''}</span>
            )}
            {!isFullscreen && (
              <button
                onClick={enterFullscreen}
                className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-white"
              >
                <Maximize className="w-3 h-3" />
                Plein écran
              </button>
            )}
          </div>
        </div>
      )}

      {showWarning && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-md text-sm font-medium animate-bounce">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          {warningMsg}
        </div>
      )}

      {children}
    </div>
  );
}

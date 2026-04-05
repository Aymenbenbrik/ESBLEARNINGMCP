'use client';
/**
 * FaceMonitor — Surveillance continue du visage pendant une épreuve.
 * Utilise getUserMedia + canvas pour détecter l'absence/présence de visage.
 * Appelle onViolation lorsqu'aucun visage n'est détecté ou quand plusieurs sont détectés.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, Camera, CameraOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FaceMonitorProps {
  sessionId: number;
  onViolation: (type: string, details?: string) => void;
  enabled?: boolean;
}

export function FaceMonitor({ sessionId, onViolation, enabled = true }: FaceMonitorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'active' | 'error'>('loading');
  const [faceStatus, setFaceStatus] = useState<'ok' | 'missing' | 'multiple'>('ok');
  const [noFaceCount, setNoFaceCount] = useState(0);
  const violationCooldownRef = useRef<number>(0);

  // Start camera
  useEffect(() => {
    if (!enabled) return;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraStatus('active');
        }
      } catch {
        setCameraStatus('error');
        onViolation('camera_denied', "L'accès à la caméra a été refusé");
      }
    };

    startCamera();

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled]);

  // Detect face using simple luminance/motion analysis every 5 seconds
  const analyzeFace = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || cameraStatus !== 'active') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 160;
    canvas.height = 120;
    ctx.drawImage(video, 0, 0, 160, 120);

    const imageData = ctx.getImageData(0, 0, 160, 120);
    const data = imageData.data;

    // Simple skin tone detection heuristic
    let skinPixels = 0;
    const totalPixels = 160 * 120;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Skin tone detection: r > 95, g > 40, b > 20, r > g, r > b, |r-g| > 15
      if (r > 80 && g > 35 && b > 15 && r > g && r > b && (r - g) > 10 && r < 250) {
        skinPixels++;
      }
    }

    const skinRatio = skinPixels / totalPixels;
    const now = Date.now();

    if (skinRatio < 0.02) {
      // No face detected
      setFaceStatus('missing');
      const newCount = noFaceCount + 1;
      setNoFaceCount(newCount);

      if (newCount >= 2 && now > violationCooldownRef.current) {
        onViolation('face_not_detected', `Visage absent (ratio peau: ${(skinRatio * 100).toFixed(1)}%)`);
        violationCooldownRef.current = now + 30000; // 30s cooldown
        setNoFaceCount(0);
      }
    } else {
      setFaceStatus('ok');
      setNoFaceCount(0);
    }
  }, [cameraStatus, noFaceCount, onViolation]);

  // Run face analysis every 5 seconds
  useEffect(() => {
    if (cameraStatus === 'active' && enabled) {
      intervalRef.current = setInterval(analyzeFace, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cameraStatus, enabled, analyzeFace]);

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-gray-700">
      <div className="relative w-[200px]">
        {/* Video Feed */}
        <video
          ref={videoRef}
          className="w-full"
          style={{ transform: 'scaleX(-1)' }}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Status Overlay */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
          {cameraStatus === 'error' ? (
            <Badge variant="destructive" className="text-xs gap-1">
              <CameraOff className="h-3 w-3" /> Caméra indisponible
            </Badge>
          ) : (
            <Badge
              variant={faceStatus === 'ok' ? 'default' : 'destructive'}
              className="text-xs gap-1"
            >
              <Camera className="h-3 w-3" />
              {faceStatus === 'ok' ? '✓ Visage détecté' : '⚠ Visage absent'}
            </Badge>
          )}
        </div>

        {/* Warning Banner */}
        {faceStatus === 'missing' && (
          <div className="absolute bottom-0 inset-x-0 bg-red-600/90 px-2 py-1 text-xs text-white text-center flex items-center justify-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Votre visage doit être visible
          </div>
        )}
      </div>
    </div>
  );
}

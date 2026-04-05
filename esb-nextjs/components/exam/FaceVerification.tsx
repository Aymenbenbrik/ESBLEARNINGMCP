'use client';
/**
 * FaceVerification — Vérification d'identité FaceID au démarrage de l'épreuve.
 * Capture une photo via webcam et la compare avec la photo de référence.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, CheckCircle, XCircle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { examBankApi } from '@/lib/api/exam-bank';

interface FaceVerificationProps {
  studentId: number;
  sessionId: number;
  onVerified: (score: number) => void;
  onSkip?: () => void; // Used when no reference photo exists
}

type VerificationState = 'idle' | 'camera' | 'capturing' | 'verifying' | 'success' | 'failed';

export function FaceVerification({ studentId, sessionId, onVerified, onSkip }: FaceVerificationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<VerificationState>('idle');
  const [message, setMessage] = useState('');
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null);

  // Check if student has a reference photo
  useEffect(() => {
    examBankApi.checkStudentPhoto(studentId)
      .then(r => setHasPhoto(r.data.has_photo))
      .catch(() => setHasPhoto(false));
  }, [studentId]);

  const startCamera = useCallback(async () => {
    try {
      setState('camera');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setState('failed');
      setMessage("Impossible d'accéder à la caméra. Veuillez autoriser l'accès.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const captureAndVerify = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setState('capturing');

    // Capture frame
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, 640, 480);

    const imageB64 = canvas.toDataURL('image/jpeg', 0.8);
    setState('verifying');

    try {
      const response = await examBankApi.verifyFace(imageB64, studentId);
      const result = response.data;
      setScore(result.score);
      setMessage(result.message);

      if (result.verified) {
        stopCamera();
        setState('success');
        // Mark session as face-verified
        await examBankApi.markFaceVerified(sessionId, result.score);
        setTimeout(() => onVerified(result.score), 1500);
      } else {
        setState('failed');
        setAttempts(prev => prev + 1);
      }
    } catch {
      setState('failed');
      setMessage('Erreur lors de la vérification. Veuillez réessayer.');
      setAttempts(prev => prev + 1);
    }
  }, [studentId, sessionId, onVerified, stopCamera]);

  const retry = useCallback(() => {
    setState('camera');
    startCamera();
  }, [startCamera]);

  // Auto-skip if no reference photo
  if (hasPhoto === false) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-500" />
            Vérification d&apos;identité
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground text-sm">
            Aucune photo de référence enregistrée pour votre compte.
            La caméra sera activée pendant l&apos;épreuve pour la surveillance.
          </p>
          <Button onClick={() => { onVerified(0.5); if (onSkip) onSkip(); }} className="w-full">
            Continuer sans vérification
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (hasPhoto === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-500" />
          Vérification d&apos;identité FaceID
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'idle' && (
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Avant de commencer l&apos;épreuve, votre identité doit être vérifiée via la caméra.
              Assurez-vous d&apos;être bien éclairé et centré dans le cadre.
            </p>
            <Button onClick={startCamera} className="w-full">
              <Camera className="mr-2 h-4 w-4" />
              Activer la caméra
            </Button>
          </div>
        )}

        {(state === 'camera' || state === 'capturing' || state === 'verifying') && (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
                muted
                playsInline
              />
              {(state === 'capturing' || state === 'verifying') && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-white" />
                </div>
              )}
              {/* Face guide overlay */}
              {state === 'camera' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-40 h-48 border-4 border-white/60 rounded-full" />
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            {state === 'camera' && (
              <Button onClick={captureAndVerify} className="w-full">
                <Camera className="mr-2 h-4 w-4" />
                Prendre une photo et vérifier
              </Button>
            )}
            {state === 'verifying' && (
              <p className="text-center text-sm text-muted-foreground">
                Vérification en cours...
              </p>
            )}
          </div>
        )}

        {state === 'success' && (
          <div className="text-center space-y-3 py-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h3 className="text-lg font-semibold text-green-600">Identité vérifiée !</h3>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Progress value={score * 100} className="h-2" />
            <p className="text-xs text-muted-foreground">Score: {(score * 100).toFixed(0)}%</p>
          </div>
        )}

        {state === 'failed' && (
          <div className="text-center space-y-3 py-2">
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h3 className="font-semibold text-red-600">Vérification échouée</h3>
            <p className="text-sm text-muted-foreground">{message}</p>
            {attempts < 5 ? (
              <Button onClick={retry} variant="outline" className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Réessayer ({5 - attempts} tentatives restantes)
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-red-500">Nombre maximum de tentatives atteint.</p>
                <Button onClick={() => onVerified(0)} variant="destructive" size="sm" className="w-full">
                  Continuer avec avertissement
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

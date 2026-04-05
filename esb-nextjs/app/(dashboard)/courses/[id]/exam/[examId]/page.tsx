'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useExam, useStartSession } from '@/lib/hooks/useExamBank';
import { examBankApi } from '@/lib/api/exam-bank';
import { FaceVerification } from '@/components/exam/FaceVerification';
import { FaceMonitor } from '@/components/exam/FaceMonitor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/lib/contexts/AuthContext';
import { AlertCircle, Clock, Shield, Send, ChevronLeft, ChevronRight, Maximize, Lock } from 'lucide-react';
import type { ExamSession, ExamBankQuestion } from '@/lib/types/exam-bank';

type ExamPhase = 'loading' | 'face-id' | 'instructions' | 'in-progress' | 'submitting' | 'submitted';

export default function SafeExamPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const courseId = parseInt(params.id as string);
  const examId   = parseInt(params.examId as string);

  const [phase, setPhase]               = useState<ExamPhase>('loading');
  const [session, setSession]           = useState<ExamSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers]           = useState<Record<number, { text?: string; choice?: string }>>({});
  const [timeLeft, setTimeLeft]         = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const timerRef     = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const { data: exam, isLoading: examLoading } = useExam(examId);
  const startSessionMut = useStartSession();

  const requestFullscreen = useCallback(async () => {
    try { await document.documentElement.requestFullscreen(); setIsFullscreen(true); }
    catch { toast.error('Activez le plein écran manuellement (F11).'); }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (phase !== 'in-progress' || !exam?.disable_copy_paste) return;
    const blockClip = (e: ClipboardEvent) => { e.preventDefault(); handleViolation('copy', e.type + ' bloqué'); };
    const blockCtx  = (e: MouseEvent)     => e.preventDefault();
    const blockKeys = (e: KeyboardEvent)  => {
      if (e.ctrlKey && ['c','v','x','a','p','s','u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (['c','v','x'].includes(e.key.toLowerCase())) handleViolation('copy', 'CTRL+' + e.key.toUpperCase() + ' bloqué');
      }
      if (['F12','F5'].includes(e.key)) e.preventDefault();
    };
    document.addEventListener('copy', blockClip);
    document.addEventListener('cut', blockClip);
    document.addEventListener('paste', blockClip);
    document.addEventListener('contextmenu', blockCtx);
    document.addEventListener('keydown', blockKeys);
    return () => {
      document.removeEventListener('copy', blockClip);
      document.removeEventListener('cut', blockClip);
      document.removeEventListener('paste', blockClip);
      document.removeEventListener('contextmenu', blockCtx);
      document.removeEventListener('keydown', blockKeys);
    };
  }, [phase, exam?.disable_copy_paste]);

  useEffect(() => {
    if (phase !== 'in-progress') return;
    const onFs  = () => { if (!document.fullscreenElement && exam?.fullscreen_required) { setIsFullscreen(false); handleViolation('fullscreen_exit', 'Sortie plein écran'); }};
    const onVis = () => { if (document.hidden) handleViolation('tab_switch', "Changement d'onglet"); };
    const onBlur = () => handleViolation('window_blur', 'Fenêtre non focalisée');
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
    };
  }, [phase, exam?.fullscreen_required]);

  useEffect(() => {
    if (phase !== 'in-progress' || !exam) return;
    const total = exam.duration_minutes * 60;
    setTimeLeft(total);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); doSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, exam?.duration_minutes]);

  const handleViolation = useCallback(async (type: string, details?: string) => {
    if (!session) return;
    setViolationCount(prev => prev + 1);
    try {
      const res = await examBankApi.recordViolation(session.id, type, details);
      if (res.data.is_disqualified) {
        toast.error('Vous êtes disqualifié(e) pour violations répétées.');
        if (timerRef.current) clearInterval(timerRef.current);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        router.push('/courses/' + courseId);
      } else { toast.warning('⚠ ' + (details || type)); }
    } catch { /* silent */ }
  }, [session, courseId, router]);

  const saveAnswer = useCallback(async (questionId: number) => {
    if (!session) return;
    const ans = answers[questionId];
    if (!ans) return;
    try { await examBankApi.saveAnswer(session.id, { question_id: questionId, student_answer: ans.text, student_choice: ans.choice }); }
    catch { /* silent */ }
  }, [session, answers]);

  useEffect(() => {
    if (phase !== 'in-progress') return;
    const t = setInterval(() => { const q = exam?.questions?.[currentIndex]; if (q) saveAnswer(q.id); }, 15000);
    return () => clearInterval(t);
  }, [phase, currentIndex, saveAnswer]);

  useEffect(() => {
    if (!examLoading && exam) setPhase(exam.face_id_required ? 'face-id' : 'instructions');
  }, [exam, examLoading]);

  const handleStartExam = useCallback(async () => {
    if (!exam) return;
    try {
      const s = await startSessionMut.mutateAsync(examId);
      setSession(s);
      if (exam.fullscreen_required) await requestFullscreen();
      setPhase('in-progress');
    } catch (err: any) { toast.error(err?.response?.data?.error || "Impossible de démarrer l'épreuve"); }
  }, [exam, examId, startSessionMut, requestFullscreen]);

  const doSubmit = useCallback(async () => {
    if (!session || isSubmitting) return;
    setIsSubmitting(true);
    setPhase('submitting');
    const questions = exam?.questions || [];
    for (const q of questions) await saveAnswer(q.id);
    const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
    try {
      if (timerRef.current) clearInterval(timerRef.current);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      await examBankApi.submitSession(session.id, timeSpent);
      setPhase('submitted');
      toast.success('Épreuve soumise !');
      setTimeout(() => router.push('/courses/' + courseId + '/exam/' + examId + '/results?session=' + session.id), 1500);
    } catch {
      toast.error('Erreur lors de la soumission.');
      setIsSubmitting(false);
      setPhase('in-progress');
    }
  }, [session, isSubmitting, exam, saveAnswer, courseId, examId, router]);

  useEffect(() => {
    if (phase !== 'in-progress') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = 'Épreuve en cours. Quitter ?'; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  const fmt = (s: number) => String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
  const setAnswer = (id: number, text?: string, choice?: string) => setAnswers(prev => ({ ...prev, [id]: { text, choice } }));
  const questions = exam?.questions || [];
  const cur = questions[currentIndex];
  const answered = Object.keys(answers).length;
  const pct = questions.length ? (answered / questions.length) * 100 : 0;
  const isLowTime = timeLeft < 300;

  if (examLoading || phase === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Shield className="h-12 w-12 text-blue-500 mx-auto mb-4 animate-pulse" />
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    </div>
  );

  if (!exam) return <div className="min-h-screen flex items-center justify-center"><p className="text-destructive">Épreuve introuvable.</p></div>;

  if (phase === 'face-id') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">{exam.title}</h1>
        <FaceVerification studentId={user?.id ?? 0} sessionId={0} onVerified={() => setPhase('instructions')} />
      </div>
    </div>
  );

  if (phase === 'instructions') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3"><Shield className="h-12 w-12 text-blue-500" /></div>
          <CardTitle className="text-2xl">{exam.title}</CardTitle>
          {exam.description && <p className="text-muted-foreground text-sm mt-1">{exam.description}</p>}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-blue-50 rounded-lg p-3">
              <Clock className="h-5 w-5 text-blue-500 mx-auto mb-1" />
              <p className="text-sm font-semibold">{exam.duration_minutes} min</p>
              <p className="text-xs text-muted-foreground">Durée</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-purple-600">{questions.length}</p>
              <p className="text-xs text-muted-foreground">Questions</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-green-600">{exam.total_points}</p>
              <p className="text-xs text-muted-foreground">Points</p>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-amber-800 flex items-center gap-2">
              <Lock className="h-4 w-4" />Règles Safe Exam
            </h3>
            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
              {exam.fullscreen_required && <li>Mode plein écran obligatoire</li>}
              {exam.disable_copy_paste   && <li>Copier / Coller désactivé (CTRL+C/V bloqués)</li>}
              {exam.camera_monitoring    && <li>Caméra activée — visage requis en permanence</li>}
              <li>Soumission obligatoire avant toute sortie</li>
              <li>Changements d&apos;onglet enregistrés comme violations</li>
            </ul>
          </div>
          <Button onClick={handleStartExam} className="w-full" size="lg" disabled={startSessionMut.isPending}>
            {startSessionMut.isPending ? 'Démarrage...' : "🚀 Commencer l'épreuve"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  if (phase === 'submitting' || phase === 'submitted') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <Send className="h-8 w-8 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold">{phase === 'submitting' ? 'Soumission en cours...' : '✅ Épreuve soumise !'}</h2>
        <p className="text-muted-foreground">Redirection vers vos résultats...</p>
      </div>
    </div>
  );

  if (!cur) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md shadow-lg text-center">
        <CardContent className="pt-8 pb-6 space-y-4">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold">Aucune question disponible</h2>
          <p className="text-sm text-muted-foreground">
            Cette épreuve ne contient pas encore de questions. Contactez votre enseignant.
          </p>
          <Button variant="outline" onClick={() => router.push('/courses/' + courseId)}>
            Retour au cours
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ userSelect: 'none' }}>
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-blue-500" />
          <span className="font-semibold text-sm max-w-[200px] truncate">{exam.title}</span>
          {violationCount > 0 && <Badge variant="destructive" className="text-xs">{violationCount} violation{violationCount > 1 ? 's' : ''}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <span className={"font-mono text-lg font-bold flex items-center gap-1 " + (isLowTime ? 'text-red-500 animate-pulse' : 'text-gray-700')}>
            <Clock className="h-4 w-4" />{fmt(timeLeft)}
          </span>
          {!isFullscreen && exam.fullscreen_required && (
            <Button variant="outline" size="sm" onClick={requestFullscreen}><Maximize className="h-4 w-4 mr-1" />Plein écran</Button>
          )}
          <Button size="sm" onClick={() => { if (confirm("Soumettre l'épreuve maintenant ?")) doSubmit(); }} disabled={isSubmitting}>
            <Send className="h-4 w-4 mr-1" />Soumettre
          </Button>
        </div>
      </div>

      <div className="px-4 py-2 bg-white border-b">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Question {currentIndex + 1} / {questions.length}</span>
          <span>{answered} / {questions.length} répondue{answered > 1 ? 's' : ''}</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      {!isFullscreen && exam.fullscreen_required && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />Mode plein écran requis.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-16 bg-white border-r p-2 flex flex-col gap-1 overflow-y-auto">
          {questions.map((q, idx) => (
            <button key={q.id} onClick={() => { saveAnswer(cur.id); setCurrentIndex(idx); }}
              className={"w-10 h-10 rounded-lg text-xs font-bold mx-auto transition-colors " + (idx === currentIndex ? 'bg-blue-500 text-white' : answers[q.id] ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
              {idx + 1}
            </button>
          ))}
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          <QuestionRenderer question={cur} answer={answers[cur.id]} onChange={(t, c) => setAnswer(cur.id, t, c)} />
        </div>
      </div>

      <div className="bg-white border-t px-6 py-3 flex justify-between items-center">
        <Button variant="outline" onClick={() => { saveAnswer(cur.id); setCurrentIndex(p => Math.max(0, p - 1)); }} disabled={currentIndex === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" />Précédent
        </Button>
        <span className="text-sm text-muted-foreground">{currentIndex + 1} / {questions.length}</span>
        {currentIndex < questions.length - 1 ? (
          <Button onClick={() => { saveAnswer(cur.id); setCurrentIndex(p => p + 1); }}>
            Suivant<ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={() => { saveAnswer(cur.id); if (confirm('Terminer et soumettre ?')) doSubmit(); }}>
            <Send className="h-4 w-4 mr-1" />Terminer
          </Button>
        )}
      </div>

      {exam.camera_monitoring && session && (
        <FaceMonitor sessionId={session.id} onViolation={handleViolation} enabled />
      )}
    </div>
  );
}

interface QRProps { question: ExamBankQuestion; answer?: { text?: string; choice?: string }; onChange: (t?: string, c?: string) => void; }
const typeLabels: Record<string, string> = { mcq: 'QCM', open_ended: 'Question ouverte', code: 'Code', true_false: 'Vrai / Faux', practical: 'Pratique' };

function QuestionRenderer({ question, answer, onChange }: QRProps) {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{typeLabels[question.question_type] || question.question_type}</Badge>
          <Badge variant="secondary">{question.points} pt{question.points > 1 ? 's' : ''}</Badge>
          {question.difficulty && <Badge variant="outline" className="text-xs capitalize">{question.difficulty}</Badge>}
        </div>
        <h2 className="text-lg font-medium leading-relaxed whitespace-pre-line">{question.question_text}</h2>
      </div>

      {question.question_type === 'mcq' && (
        <RadioGroup value={answer?.choice || ''} onValueChange={v => onChange(undefined, v)} className="space-y-3">
          {(['A','B','C','D'] as const).map(key => {
            const text = (question as any)['choice_' + key.toLowerCase()] as string;
            if (!text) return null;
            return (
              <div key={key} onClick={() => onChange(undefined, key)}
                className={"flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors " + (answer?.choice === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50')}>
                <RadioGroupItem value={key} id={"c-" + key} />
                <Label htmlFor={"c-" + key} className="cursor-pointer flex-1">
                  <span className="font-bold mr-2">{key}.</span>{text}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      )}

      {question.question_type === 'true_false' && (
        <div className="flex gap-4">
          {['True','False'].map(val => (
            <div key={val} onClick={() => onChange(undefined, val)}
              className={"flex-1 flex items-center justify-center p-6 rounded-xl border-2 cursor-pointer transition-colors " + (answer?.choice === val ? (val === 'True' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50') : 'border-gray-200 hover:border-gray-300')}>
              <span className="text-xl font-bold">{val === 'True' ? '✓ Vrai' : '✗ Faux'}</span>
            </div>
          ))}
        </div>
      )}

      {(question.question_type === 'open_ended' || question.question_type === 'practical') && (
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Votre réponse :</Label>
          <Textarea placeholder="Rédigez votre réponse ici..." value={answer?.text || ''} onChange={e => onChange(e.target.value)}
            className="min-h-[200px] resize-y" onPaste={e => e.preventDefault()} onCopy={e => e.preventDefault()} />
          <p className="text-xs text-muted-foreground text-right">{(answer?.text || '').length} caractères</p>
        </div>
      )}

      {question.question_type === 'code' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Code :</Label>
            {question.programming_language && <Badge variant="secondary" className="text-xs">{question.programming_language}</Badge>}
          </div>
          <Textarea placeholder={"// Code " + (question.programming_language || '') + " ici..."} value={answer?.text || ''} onChange={e => onChange(e.target.value)}
            className="min-h-[250px] resize-y font-mono text-sm bg-gray-900 text-green-400 border-gray-700"
            onPaste={e => e.preventDefault()} onCopy={e => e.preventDefault()} />
          {question.expected_output && (
            <div className="bg-gray-100 rounded p-3">
              <p className="text-xs text-muted-foreground font-mono">Sortie attendue:</p>
              <pre className="text-xs font-mono mt-1">{question.expected_output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

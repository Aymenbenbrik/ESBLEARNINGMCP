'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Bot, Play, Square, RotateCcw, CheckCircle2, XCircle, Loader2,
  Clock, FileSearch, BookOpen, Lightbulb, FlaskConical, ClipboardList,
  BarChart2, Timer, Database, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { chapterPipelineApi, PipelineStatus } from '@/lib/api/chapter-pipeline';

const AGENT_META: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  detect_documents:      { label: 'Lire les documents',        icon: FileSearch,    description: 'Inventaire des documents du chapitre' },
  detect_exercises:      { label: 'Détecter les exercices',    icon: BookOpen,      description: 'Extraction des exercices de consolidation' },
  detect_tp:             { label: 'Détecter les TPs',          icon: FlaskConical,  description: 'Extraction des activités pratiques' },
  add_consolidation:     { label: 'Créer exercices',           icon: ClipboardList, description: 'Enregistrement des exercices en base de données' },
  generate_answers:      { label: 'Générer les réponses',      icon: Lightbulb,     description: 'Génération des réponses modèles par IA' },
  add_tp:                { label: 'Créer les TPs',             icon: FlaskConical,  description: 'Enregistrement des TPs en base de données' },
  generate_tp_corrections:{ label: 'Corriger les TPs',         icon: Lightbulb,     description: 'Génération des corrections des TPs' },
  generate_scores:       { label: 'Générer les barèmes',       icon: BarChart2,     description: 'Proposition des barèmes détaillés' },
  generate_durations:    { label: 'Durées & Classification',   icon: Timer,         description: 'Estimation des durées et vérification Bloom/AA' },
  add_to_bank:           { label: 'Banque de questions',       icon: Database,      description: 'Ajout des exercices validés dans la banque' },
};

const AGENTS = Object.keys(AGENT_META);

interface Props {
  chapterId: number;
  onComplete?: () => void;
}

function AgentIcon({ name, status }: { name: string; status: string }) {
  const Icon = AGENT_META[name]?.icon || Bot;
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  if (status === 'done')    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === 'failed')  return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === 'skipped') return <Icon className="h-4 w-4 text-gray-300" />;
  return <Icon className="h-4 w-4 text-gray-400" />;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    idle: 'secondary', running: 'default', paused: 'outline',
    done: 'default', failed: 'destructive',
  };
  const colorMap: Record<string, string> = {
    idle: '', running: 'bg-blue-100 text-blue-700',
    paused: '', done: 'bg-green-100 text-green-700', failed: '',
  };
  const labels: Record<string, string> = {
    idle: 'En attente', running: 'En cours…', paused: 'Suspendu',
    done: 'Terminé', failed: 'Erreur',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorMap[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}

export function AgenticPipelinePanel({ chapterId, onComplete }: Props) {
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await chapterPipelineApi.getStatus(chapterId);
      setPipeline(data);
      if (data.status === 'done' || data.status === 'failed' || data.status === 'idle' || data.status === 'paused') {
        return false; // stop polling
      }
      return true; // continue polling
    } catch {
      return false;
    }
  }, [chapterId]);

  // Poll while running
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(async () => {
      const shouldContinue = await fetchStatus();
      if (!shouldContinue) {
        clearInterval(interval);
        if (pipeline?.status === 'done') onComplete?.();
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRun = async () => {
    setLoading(true);
    try {
      await chapterPipelineApi.run(chapterId);
      toast.success('Pipeline démarré — les agents IA analysent vos documents');
      setExpanded(true);
      await fetchStatus();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erreur de démarrage');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      await chapterPipelineApi.stop(chapterId);
      toast.info('Pipeline suspendu');
      await fetchStatus();
    } catch {
      toast.error('Erreur lors de la suspension');
    }
  };

  const handleReset = async () => {
    try {
      await chapterPipelineApi.reset(chapterId);
      toast.info('Pipeline réinitialisé');
      await fetchStatus();
    } catch {
      toast.error('Erreur lors de la réinitialisation');
    }
  };

  const doneCount = pipeline
    ? AGENTS.filter(a => pipeline.agents_state?.[a]?.status === 'done').length
    : 0;
  const progress = (doneCount / AGENTS.length) * 100;
  const isRunning = pipeline?.status === 'running';
  const isDone    = pipeline?.status === 'done';

  return (
    <div className="border rounded-lg bg-gradient-to-br from-slate-50 to-blue-50 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Bot className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-sm">Pipeline Agentic IA</p>
            <p className="text-xs text-muted-foreground">
              {pipeline
                ? `${doneCount}/${AGENTS.length} agents • ${pipeline.exercise_count} exercices • ${pipeline.tp_count} TPs`
                : 'Analyser automatiquement les documents du chapitre'}
            </p>
          </div>
          {pipeline && statusBadge(pipeline.status)}
        </div>
        <div className="flex items-center gap-2">
          {(!pipeline || pipeline.status === 'idle' || pipeline.status === 'paused' || pipeline.status === 'failed') && (
            <Button size="sm" onClick={handleRun} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {pipeline?.status === 'paused' ? 'Reprendre' : 'Lancer l\'analyse IA'}
            </Button>
          )}
          {isRunning && (
            <Button size="sm" variant="outline" onClick={handleStop} className="gap-1.5">
              <Square className="h-3.5 w-3.5" />
              Suspendre
            </Button>
          )}
          {(isDone || pipeline?.status === 'failed') && (
            <Button size="sm" variant="ghost" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Réinitialiser
            </Button>
          )}
          <Button
            size="sm" variant="ghost"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {pipeline && pipeline.status !== 'idle' && (
        <div className="px-4 pb-2">
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {/* Agent steps */}
      {expanded && (
        <div className="border-t px-4 py-3 grid grid-cols-1 gap-1.5">
          {AGENTS.map((agentName, idx) => {
            const meta = AGENT_META[agentName];
            const state = pipeline?.agents_state?.[agentName];
            const agStatus = state?.status || 'pending';
            return (
              <div
                key={agentName}
                className={`flex items-center gap-3 p-2 rounded-md text-sm transition-colors ${
                  agStatus === 'running' ? 'bg-blue-50 border border-blue-200' :
                  agStatus === 'done'    ? 'bg-green-50' :
                  agStatus === 'failed'  ? 'bg-red-50' : 'opacity-60'
                }`}
              >
                <span className="text-xs text-muted-foreground w-4 text-right">{idx + 1}</span>
                <AgentIcon name={agentName} status={agStatus} />
                <div className="flex-1">
                  <span className="font-medium">{meta.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{meta.description}</span>
                </div>
                {state?.result_count != null && agStatus === 'done' && (
                  <Badge variant="outline" className="text-xs">
                    {state.result_count} résultat{state.result_count !== 1 ? 's' : ''}
                  </Badge>
                )}
                {state?.done_at && agStatus === 'done' && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {new Date(state.done_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {agStatus === 'failed' && state?.error && (
                  <span className="text-xs text-red-600 truncate max-w-32" title={state.error}>
                    {state.error.slice(0, 40)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {pipeline?.error_message && pipeline.status === 'failed' && (
        <div className="border-t px-4 py-2 bg-red-50">
          <p className="text-xs text-red-600">Erreur: {pipeline.error_message}</p>
        </div>
      )}
    </div>
  );
}

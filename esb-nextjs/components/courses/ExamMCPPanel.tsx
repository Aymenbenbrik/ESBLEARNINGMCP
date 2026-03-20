'use client';
/**
 * ExamMCPPanel — displays the MCP multi-agent exam analysis pipeline.
 * Shows real-time progress across 10 agents, then displays results.
 */
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Upload,
  FileQuestion,
  Tag,
  Brain,
  BarChart3,
  GitCompare,
  MessageSquare,
  Lightbulb,
  FileCode2,
  Star,
  CheckCircle2,
  Loader2,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

const AGENTS = [
  { key: 'extract_text',        label: 'Extraction du texte',          icon: Upload },
  { key: 'extract_questions',   label: 'Extraction des questions',      icon: FileQuestion },
  { key: 'classify_aa',         label: 'Classification AA',             icon: Tag },
  { key: 'classify_bloom',      label: 'Taxonomie de Bloom',            icon: Brain },
  { key: 'assess_difficulty',   label: 'Évaluation de la difficulté',   icon: BarChart3 },
  { key: 'compare_content',     label: 'Comparaison Module ↔ Examen',   icon: GitCompare },
  { key: 'analyze_feedback',    label: 'Feedback pédagogique',          icon: MessageSquare },
  { key: 'suggest_adjustments', label: 'Ajustements suggérés',          icon: Lightbulb },
  { key: 'generate_latex',      label: 'Génération LaTeX + PDF',        icon: FileCode2 },
  { key: 'evaluate_proposal',   label: 'Évaluation de la proposition',  icon: Star },
] as const;

const BLOOM_COLORS: Record<string, string> = {
  'Mémoriser':  'bg-gray-100 text-gray-700',
  'Comprendre': 'bg-blue-100 text-blue-700',
  'Appliquer':  'bg-green-100 text-green-700',
  'Analyser':   'bg-yellow-100 text-yellow-700',
  'Évaluer':    'bg-orange-100 text-orange-700',
  'Créer':      'bg-purple-100 text-purple-700',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  'Très facile':    'bg-emerald-100 text-emerald-700',
  'Facile':         'bg-green-100 text-green-700',
  'Moyen':          'bg-yellow-100 text-yellow-700',
  'Difficile':      'bg-orange-100 text-orange-700',
  'Très difficile': 'bg-red-100 text-red-700',
};

interface ExamMCPPanelProps {
  courseId: number;
  documentId: number;
  documentTitle: string;
  apiBase?: string;
}

interface ExtractedQuestion {
  id?: number;
  number: number;
  text: string;
  points?: number | null;
  aa_codes?: number[];
  bloom_level?: string;
  difficulty?: string;
  difficulty_justification?: string;
  adjustment_suggestion?: string;
}

interface ComparisonReport {
  aa_coverage_rate: number;
  missing_aa?: number[];
  bloom_percentages?: Record<string, number>;
}

interface Adjustment {
  type: string;
  target_question?: number;
  description: string;
  new_text?: string;
}

interface ProposalEvaluation {
  overall_score: number;
  final_recommendation: string;
  scores?: Record<string, number>;
}

interface SessionData {
  status: string;
  progress: number;
  current_agent: string;
  error_message?: string;
  latex_source?: string;
  latex_pdf_path?: string;
  questions?: ExtractedQuestion[];
  state?: {
    comparison_report?: ComparisonReport;
    feedback?: string;
    adjustments?: Adjustment[];
    proposal_evaluation?: ProposalEvaluation;
  };
}

export function ExamMCPPanel({
  courseId,
  documentId,
  documentTitle,
  apiBase = '/api/v1',
}: ExamMCPPanelProps) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentAgent, setCurrentAgent] = useState('');
  const [questions, setQuestions] = useState<ExtractedQuestion[]>([]);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('questions');
  const [showLatex, setShowLatex] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getAuthHeader = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
    return { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' };
  };

  const launchAnalysis = async () => {
    setIsLaunching(true);
    try {
      const res = await fetch(`${apiBase}/courses/${courseId}/tn-exams/${documentId}/analyze-mcp`, {
        method: 'POST',
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSessionId(data.session_id);
      setStatus('running');
      setProgress(0);
      setQuestions([]);
      setSessionData(null);
      toast.success('Analyse MCP lancée — 10 agents en cours...');
      startPolling(data.session_id);
    } catch (e: unknown) {
      toast.error(`Erreur: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLaunching(false);
    }
  };

  const startPolling = (sid: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/courses/${courseId}/tn-exams/mcp-session/${sid}`, {
          headers: getAuthHeader(),
        });
        if (!res.ok) return;
        const data: SessionData & { id: number } = await res.json();
        setProgress(data.progress ?? 0);
        setCurrentAgent(data.current_agent ?? '');
        setSessionData(data);
        if (data.questions?.length) setQuestions(data.questions);
        if (data.status === 'done') {
          setStatus('done');
          clearInterval(pollRef.current!);
          toast.success('Analyse MCP terminée !');
        } else if (data.status === 'error') {
          setStatus('error');
          clearInterval(pollRef.current!);
          toast.error(`Erreur: ${data.error_message ?? 'Inconnue'}`);
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const downloadPdf = () => {
    if (!sessionId) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
    window.open(
      `/api/v1/courses/${courseId}/tn-exams/mcp-session/${sessionId}/pdf?token=${token ?? ''}`,
      '_blank',
    );
  };

  const toggleSection = (key: string) =>
    setExpandedSection(expandedSection === key ? null : key);

  // Current agent step for pipeline visualization
  const currentAgentStep = AGENTS.findIndex(a =>
    currentAgent.toLowerCase().includes(a.label.toLowerCase())
  );
  const activeStep = currentAgentStep >= 0 ? currentAgentStep : Math.floor(progress / 10);

  const comparisonReport = sessionData?.state?.comparison_report;
  const feedback = sessionData?.state?.feedback;
  const adjustments = sessionData?.state?.adjustments;
  const evaluation = sessionData?.state?.proposal_evaluation;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-violet-900">🤖 Analyse MCP Approfondie</h3>
              <p className="text-xs text-violet-600">10 agents spécialisés · Gemini 2.5 Pro · {documentTitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === 'idle' && (
              <Button
                onClick={launchAnalysis}
                disabled={isLaunching}
                className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm"
              >
                {isLaunching ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Lancement...</>
                ) : (
                  '🚀 Lancer l\'analyse'
                )}
              </Button>
            )}
            {status === 'done' && (
              <>
                <Button
                  onClick={downloadPdf}
                  variant="outline"
                  size="sm"
                  className="border-violet-300 text-violet-700 rounded-xl"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />PDF
                </Button>
                <Button
                  onClick={launchAnalysis}
                  variant="outline"
                  size="sm"
                  className="border-violet-300 text-violet-700 rounded-xl"
                >
                  Relancer
                </Button>
              </>
            )}
            {status === 'error' && (
              <Button
                onClick={launchAnalysis}
                variant="outline"
                size="sm"
                className="border-red-300 text-red-700 rounded-xl"
              >
                Réessayer
              </Button>
            )}
          </div>
        </div>

        {(status === 'running' || status === 'done') && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-violet-600 mb-1">
              <span>{currentAgent || 'Initialisation...'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-violet-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Pipeline visualization */}
      {status !== 'idle' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Pipeline d'agents</h4>
          <div className="grid grid-cols-2 gap-2">
            {AGENTS.map((agent, idx) => {
              const Icon = agent.icon;
              const isDone = status === 'done' || idx < activeStep;
              const isActive = status === 'running' && idx === activeStep;
              return (
                <div
                  key={agent.key}
                  className={`flex items-center gap-2 rounded-xl p-2 border text-xs transition-all ${
                    isDone
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : isActive
                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                      : 'border-gray-100 bg-gray-50 text-gray-400'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : isActive ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-500" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{agent.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Questions table */}
      {questions.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
            onClick={() => toggleSection('questions')}
          >
            <div className="flex items-center gap-2">
              <FileQuestion className="h-4 w-4 text-violet-600" />
              <span className="font-medium text-sm">Questions extraites ({questions.length})</span>
            </div>
            {expandedSection === 'questions' ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {expandedSection === 'questions' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-t border-b border-gray-200">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600 w-8">#</th>
                    <th className="text-left p-3 font-medium text-gray-600">Question</th>
                    <th className="text-center p-3 font-medium text-gray-600 whitespace-nowrap">AA</th>
                    <th className="text-center p-3 font-medium text-gray-600 whitespace-nowrap">Bloom</th>
                    <th className="text-center p-3 font-medium text-gray-600 whitespace-nowrap">Difficulté</th>
                    <th className="text-center p-3 font-medium text-gray-600 whitespace-nowrap">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {questions.map(q => (
                    <tr key={q.id ?? q.number} className="hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-500">{q.number}</td>
                      <td className="p-3 text-gray-700 max-w-xs">
                        <p className="line-clamp-2">{q.text}</p>
                        {q.adjustment_suggestion && (
                          <p className="mt-1 text-violet-600 italic">💡 {q.adjustment_suggestion}</p>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex flex-wrap gap-0.5 justify-center">
                          {(q.aa_codes ?? []).map(aa => (
                            <span
                              key={aa}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs"
                            >
                              AA{aa}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            q.bloom_level ? (BLOOM_COLORS[q.bloom_level] ?? 'bg-gray-100 text-gray-600') : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {q.bloom_level ?? '—'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            q.difficulty ? (DIFFICULTY_COLORS[q.difficulty] ?? 'bg-gray-100 text-gray-600') : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {q.difficulty ?? '—'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-medium text-gray-700">
                        {q.points != null ? q.points : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Comparison report */}
      {comparisonReport && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
            onClick={() => toggleSection('comparison')}
          >
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-orange-600" />
              <span className="font-medium text-sm">Comparaison Module ↔ Examen</span>
              <span className="text-xs text-muted-foreground">
                Couverture AA: {comparisonReport.aa_coverage_rate}%
              </span>
            </div>
            {expandedSection === 'comparison' ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {expandedSection === 'comparison' && (
            <div className="p-4 space-y-4 border-t border-gray-100">
              {comparisonReport.bloom_percentages && (
                <div>
                  <h5 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                    Distribution Bloom
                  </h5>
                  <div className="space-y-1.5">
                    {Object.entries(comparisonReport.bloom_percentages).map(([level, pct]) => (
                      <div key={level} className="flex items-center gap-2 text-xs">
                        <span className="w-24 text-right text-gray-600">{level}</span>
                        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-violet-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-gray-500">{pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(comparisonReport.missing_aa?.length ?? 0) > 0 && (
                <div>
                  <h5 className="text-xs font-semibold text-red-600 mb-2 uppercase tracking-wide">
                    AA Manquants
                  </h5>
                  <div className="flex flex-wrap gap-1">
                    {comparisonReport.missing_aa!.map(aa => (
                      <span
                        key={aa}
                        className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs"
                      >
                        AA{aa}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
            onClick={() => toggleSection('feedback')}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-sm">Feedback pédagogique</span>
            </div>
            {expandedSection === 'feedback' ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {expandedSection === 'feedback' && (
            <div className="p-4 border-t border-gray-100">
              <pre className="prose prose-sm max-w-none text-gray-700 text-xs whitespace-pre-wrap font-sans">
                {feedback}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Adjustments */}
      {(adjustments?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
            onClick={() => toggleSection('adjustments')}
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-600" />
              <span className="font-medium text-sm">
                Ajustements suggérés ({adjustments!.length})
              </span>
            </div>
            {expandedSection === 'adjustments' ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {expandedSection === 'adjustments' && (
            <div className="p-4 space-y-3 border-t border-gray-100">
              {adjustments!.map((adj, i) => (
                <div key={i} className="rounded-xl border border-yellow-100 bg-yellow-50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700">
                      {adj.type?.replace(/_/g, ' ')}
                    </Badge>
                    {adj.target_question && (
                      <span className="text-xs text-gray-500">Q{adj.target_question}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-700">{adj.description}</p>
                  {adj.new_text && (
                    <p className="text-xs text-gray-600 mt-1 italic border-l-2 border-yellow-300 pl-2">
                      {adj.new_text.slice(0, 150)}...
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LaTeX source */}
      {sessionData?.latex_source && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
            onClick={() => setShowLatex(!showLatex)}
          >
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-green-600" />
              <span className="font-medium text-sm">Source LaTeX généré</span>
              {sessionData.latex_pdf_path && (
                <Badge className="bg-green-100 text-green-700 border-0 text-xs">
                  PDF compilé ✓
                </Badge>
              )}
            </div>
            {showLatex ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showLatex && (
            <div className="border-t border-gray-100">
              <pre className="p-4 text-xs font-mono bg-gray-950 text-green-400 overflow-x-auto max-h-64">
                {sessionData.latex_source}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Final evaluation */}
      {evaluation && (
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-violet-600" />
              <h4 className="font-semibold text-violet-900 text-sm">
                Évaluation finale de la proposition
              </h4>
            </div>
            <div className="text-2xl font-bold text-violet-700">{evaluation.overall_score}/20</div>
          </div>
          <p className="text-xs text-violet-700 mb-3">{evaluation.final_recommendation}</p>
          {evaluation.scores && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(evaluation.scores).map(([key, score]) => (
                <div
                  key={key}
                  className="flex items-center justify-between bg-white/60 rounded-xl px-3 py-1.5 text-xs"
                >
                  <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-violet-700">{score}/20</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

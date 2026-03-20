'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Users,
} from 'lucide-react';
import { useTP, useTPSubmissions, useGradeSubmission } from '@/lib/hooks/usePracticalWork';
import type { CorrectionStatus, PracticalWorkSubmission, SubmissionStatus } from '@/lib/types/practicalWork';

const LANGUAGE_LABELS: Record<string, string> = {
  python: 'Python',
  sql: 'SQL',
  r: 'R',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
};

function CorrectionStatusBadge({ status }: { status: CorrectionStatus }) {
  const config: Record<CorrectionStatus, { label: string; icon: React.ReactNode; className: string }> = {
    pending: {
      label: 'En attente',
      icon: <Clock className="w-3.5 h-3.5" />,
      className: 'bg-yellow-100 text-yellow-800',
    },
    correcting: {
      label: 'En cours',
      icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
      className: 'bg-blue-100 text-blue-800',
    },
    done: {
      label: 'Corrigé',
      icon: <CheckCircle className="w-3.5 h-3.5" />,
      className: 'bg-green-100 text-green-800',
    },
    failed: {
      label: 'Échec',
      icon: <XCircle className="w-3.5 h-3.5" />,
      className: 'bg-red-100 text-red-800',
    },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${c.className}`}>
      {c.icon} {c.label}
    </span>
  );
}

function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const config: Record<SubmissionStatus, { label: string; className: string }> = {
    submitted: { label: 'Soumis', className: 'bg-gray-100 text-gray-700' },
    correcting: { label: 'En correction', className: 'bg-blue-100 text-blue-800' },
    graded: { label: 'Noté', className: 'bg-green-100 text-green-800' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${c.className}`}>
      {c.label}
    </span>
  );
}

function MarkdownText({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="text-sm text-gray-700 space-y-2">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const content = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
          return (
            <pre
              key={i}
              className="bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap"
            >
              {content}
            </pre>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line leading-relaxed">
            {part}
          </p>
        );
      })}
    </div>
  );
}

interface SubmissionRowProps {
  sub: PracticalWorkSubmission;
  maxGrade: number;
  tpId: number;
}

function SubmissionRow({ sub, maxGrade, tpId }: SubmissionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [finalGrade, setFinalGrade] = useState<number>(sub.proposed_grade ?? 0);
  const [teacherComment, setTeacherComment] = useState(sub.teacher_comment ?? '');
  const gradeSubmission = useGradeSubmission(tpId);

  const handleGrade = async () => {
    await gradeSubmission.mutateAsync({
      subId: sub.id,
      data: {
        final_grade: finalGrade,
        teacher_comment: teacherComment || undefined,
      },
    });
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-[#8B1A2E]/10 flex items-center justify-center">
            <span className="text-xs font-bold text-[#8B1A2E]">
              {sub.student_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{sub.student_name}</p>
            <p className="text-xs text-gray-500">
              Tentative #{sub.attempt_number} —{' '}
              {new Date(sub.submitted_at).toLocaleString('fr-FR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CorrectionStatusBadge status={sub.correction_status} />
          <SubmissionStatusBadge status={sub.status} />
          {sub.proposed_grade !== null && (
            <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
              IA: {sub.proposed_grade}/{maxGrade}
            </span>
          )}
          {sub.final_grade !== null && (
            <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded-full">
              Final: {sub.final_grade}/{maxGrade}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50 px-5 py-6 space-y-5">
          {sub.code ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Code soumis</p>
              <pre className="bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-4 overflow-x-auto whitespace-pre-wrap max-h-64">
                {sub.code}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">Code non disponible.</p>
          )}

          {sub.correction_report && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Rapport de correction IA
              </p>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <MarkdownText text={sub.correction_report} />
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">Notation finale</h4>
            <div className="grid grid-cols-2 gap-4">
              {sub.proposed_grade !== null && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <p className="text-xs text-blue-600 font-medium mb-1">Note proposée (IA)</p>
                  <p className="text-2xl font-bold text-blue-800">
                    {sub.proposed_grade}
                    <span className="text-sm font-normal text-blue-600">/{maxGrade}</span>
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Note finale <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={maxGrade}
                  step={0.5}
                  value={finalGrade}
                  onChange={(e) => setFinalGrade(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A2E]/30 focus:border-[#8B1A2E]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Commentaire (optionnel)</label>
              <textarea
                value={teacherComment}
                onChange={(e) => setTeacherComment(e.target.value)}
                rows={3}
                placeholder="Feedback pour l'étudiant…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A2E]/30 focus:border-[#8B1A2E] resize-y"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleGrade}
                disabled={gradeSubmission.isPending}
                className="flex items-center gap-2 bg-[#8B1A2E] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#6B1222] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {gradeSubmission.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Valider la note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeacherTPReviewPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;
  const chapterId = params.chapterId as string;
  const tpId = Number(params.tpId);

  const { data: tp, isLoading: tpLoading } = useTP(tpId);
  const { data: submissions, isLoading: subLoading, error: subError } = useTPSubmissions(tpId);

  const backUrl = `/courses/${courseId}/chapters/${chapterId}`;

  if (tpLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#8B1A2E]" />
      </div>
    );
  }

  if (!tp) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-gray-600">TP introuvable.</p>
        <button onClick={() => router.push(backUrl)} className="text-[#8B1A2E] underline text-sm">
          Retour au chapitre
        </button>
      </div>
    );
  }

  const submissionList = submissions ?? [];
  const gradedCount = submissionList.filter((s) => s.status === 'graded').length;
  const pendingCount = submissionList.filter(
    (s) => s.correction_status === 'done' && s.status !== 'graded'
  ).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push(backUrl)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Retour au chapitre</span>
          </button>
          <div className="w-px h-5 bg-gray-300" />
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900">{tp.title}</h1>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1E40AF]/10 text-[#1E40AF]">
              {LANGUAGE_LABELS[tp.language] ?? tp.language}
            </span>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                tp.status === 'published'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {tp.status === 'published' ? 'Publié' : 'Brouillon'}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-3 shadow-sm">
            <Users className="w-5 h-5 text-[#8B1A2E]" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{submissionList.length}</p>
              <p className="text-xs text-gray-500">Soumissions totales</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-3 shadow-sm">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{gradedCount}</p>
              <p className="text-xs text-gray-500">Notées</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-3 shadow-sm">
            <Clock className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
              <p className="text-xs text-gray-500">En attente de notation</p>
            </div>
          </div>
        </div>

        <h2 className="text-base font-semibold text-gray-900 mb-4">Soumissions des étudiants</h2>

        {subError && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <p className="text-sm text-red-700">Erreur lors du chargement des soumissions.</p>
          </div>
        )}

        {submissionList.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-3 shadow-sm">
            <Users className="w-10 h-10 text-gray-300" />
            <p className="text-gray-500 text-sm">Aucune soumission pour ce TP.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissionList.map((sub) => (
              <SubmissionRow key={sub.id} sub={sub} maxGrade={tp.max_grade} tpId={tpId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
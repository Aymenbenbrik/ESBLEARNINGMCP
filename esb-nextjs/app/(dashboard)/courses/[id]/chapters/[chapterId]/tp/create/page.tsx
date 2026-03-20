'use client';

import { useState, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Sparkles, CheckCircle, Code2, FileText, Target, BookOpen, Plus, X, Loader2 } from 'lucide-react';
import {
  useCreateTP,
  useUpdateTP,
  useGenerateStatement,
  useSuggestAA,
  useGenerateReference,
  usePublishTP,
} from '@/lib/hooks/usePracticalWork';
import { practicalWorkApi } from '@/lib/api/practicalWork';
import type { TPLanguage, TPQuestion } from '@/lib/types/practicalWork';

const LANGUAGES: { value: TPLanguage; label: string; icon: string }[] = [
  { value: 'python', label: 'Python', icon: '🐍' },
  { value: 'sql', label: 'SQL', icon: '🗄️' },
  { value: 'r', label: 'R', icon: '📊' },
  { value: 'java', label: 'Java', icon: '☕' },
  { value: 'c', label: 'C', icon: '⚙️' },
  { value: 'cpp', label: 'C++', icon: '🔧' },
];

const STEPS = [
  { id: 1, label: 'Informations', icon: FileText },
  { id: 2, label: 'Énoncé', icon: BookOpen },
  { id: 3, label: 'AA Codes', icon: Target },
  { id: 4, label: 'Correction', icon: Code2 },
];

export default function CreateTPPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#8B1A2E]" />
      </div>
    }>
      <CreateTPForm />
    </Suspense>
  );
}

function CreateTPForm() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = params.id as string;
  const chapterId = params.chapterId as string;
  const sectionId = Number(searchParams.get('sectionId'));

  const [step, setStep] = useState(1);
  const [tpId, setTpId] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<TPLanguage>('python');
  const [maxGrade, setMaxGrade] = useState(20);
  const [tpNature, setTpNature] = useState<'formative' | 'sommative'>('formative');

  const [statement, setStatement] = useState('');
  const [aiHint, setAiHint] = useState('');

  const [aaCodes, setAaCodes] = useState<string[]>([]);
  const [suggestedAA, setSuggestedAA] = useState<string[]>([]);
  const [selectedSuggested, setSelectedSuggested] = useState<string[]>([]);
  const [customAAInput, setCustomAAInput] = useState('');
  const [aaJustification, setAaJustification] = useState('');

  const [parsedQuestions, setParsedQuestions] = useState<TPQuestion[]>([]);
  const [questionPoints, setQuestionPoints] = useState<Record<number, number>>({});
  const [isParsing, setIsParsing] = useState(false);

  const [referenceSolution, setReferenceSolution] = useState('');
  const [correctionCriteria, setCorrectionCriteria] = useState('');
  const [referenceValidated, setReferenceValidated] = useState(false);

  const createTP = useCreateTP(sectionId);
  const updateTP = useUpdateTP(tpId ?? 0);
  const generateStatement = useGenerateStatement(tpId ?? 0);
  const suggestAA = useSuggestAA(tpId ?? 0);
  const generateReference = useGenerateReference(tpId ?? 0);
  const publishTP = usePublishTP(tpId ?? 0, sectionId);

  const backUrl = `/courses/${courseId}/chapters/${chapterId}`;

  const handleStep1Submit = async () => {
    if (!title.trim()) return;
    const tp = await createTP.mutateAsync({ title: title.trim(), language, max_grade: maxGrade, tp_nature: tpNature });
    setTpId(tp.id);
    if (tp.statement) setStatement(tp.statement);
    setStep(2);
  };

  const handleGenerateStatement = async () => {
    if (!tpId) return;
    const result = await generateStatement.mutateAsync(aiHint || undefined);
    setStatement(result.statement);
  };

  const handleStep2Submit = async () => {
    if (!tpId || !statement.trim()) return;
    await updateTP.mutateAsync({ statement: statement.trim() });
    setStep(3);
  };

  const handleSuggestAA = async () => {
    if (!tpId) return;
    const result = await suggestAA.mutateAsync();
    setSuggestedAA(result.suggested_aa);
    setAaJustification(result.justification);
    setSelectedSuggested(result.suggested_aa);
  };

  const toggleSuggestedAA = (code: string) => {
    setSelectedSuggested((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const addCustomAA = () => {
    const trimmed = customAAInput.trim().toUpperCase();
    if (trimmed && !aaCodes.includes(trimmed)) {
      setAaCodes((prev) => [...prev, trimmed]);
    }
    setCustomAAInput('');
  };

  const removeAA = (code: string) => setAaCodes((prev) => prev.filter((c) => c !== code));

  const handleStep3Submit = async () => {
    if (!tpId) return;
    const merged = Array.from(new Set([...aaCodes, ...selectedSuggested]));
    await updateTP.mutateAsync({ aa_codes: merged });
    setAaCodes(merged);
    setStep(4);
  };

  const handleParseQuestions = async () => {
    if (!tpId) return;
    setIsParsing(true);
    try {
      const questions = await practicalWorkApi.parseQuestions(tpId);
      setParsedQuestions(questions);
      const pts: Record<number, number> = {};
      questions.forEach(q => { pts[q.id] = q.points; });
      setQuestionPoints(pts);
    } catch {
      // ignore
    } finally {
      setIsParsing(false);
    }
  };

  const handlePointsChange = async (qId: number, pts: number) => {
    if (!tpId) return;
    const updated = { ...questionPoints, [qId]: pts };
    setQuestionPoints(updated);
    const updatedQuestions = parsedQuestions.map(q => ({ ...q, points: updated[q.id] ?? q.points }));
    await practicalWorkApi.update(tpId, { questions: updatedQuestions });
  };

  const handleGenerateReference = async () => {
    if (!tpId) return;
    const result = await generateReference.mutateAsync();
    setReferenceSolution(result.reference_solution);
    setCorrectionCriteria(result.correction_criteria);
  };

  const handleSaveReference = async () => {
    if (!tpId) return;
    await updateTP.mutateAsync({
      reference_solution: referenceSolution,
      correction_criteria: correctionCriteria,
      reference_validated: referenceValidated,
    });
  };

  const handlePublish = async () => {
    if (!tpId) return;
    await handleSaveReference();
    await publishTP.mutateAsync();
    router.push(backUrl);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push(backUrl)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Retour au chapitre</span>
          </button>
          <div className="w-px h-5 bg-gray-300" />
          <h1 className="text-lg font-semibold text-gray-900">Créer un TP</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-10">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      isDone
                        ? 'bg-[#8B1A2E]/30 text-[#8B1A2E]'
                        : isActive
                        ? 'bg-[#8B1A2E] text-white'
                        : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {isDone ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isActive ? 'text-[#8B1A2E]' : isDone ? 'text-[#8B1A2E]/70' : 'text-gray-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-3 transition-colors ${
                      step > s.id ? 'bg-[#8B1A2E]/40' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Informations de base</h2>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Titre du TP <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. : Manipulation de DataFrames avec Pandas"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A2E]/30 focus:border-[#8B1A2E]"
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Langage</label>
              <div className="grid grid-cols-3 gap-3">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    type="button"
                    onClick={() => setLanguage(lang.value)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                      language === lang.value
                        ? 'border-[#8B1A2E] bg-[#8B1A2E]/5 text-[#8B1A2E]'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span>{lang.icon}</span>
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-1">Note maximale</label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxGrade}
                onChange={(e) => setMaxGrade(Number(e.target.value))}
                className="w-32 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A2E]/30 focus:border-[#8B1A2E]"
              />
            </div>
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">Nature du TP</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'formative', label: '🎓 Formative', desc: "Évaluation formative — chatbot d'aide disponible", color: 'border-blue-300 bg-blue-50' },
                  { value: 'sommative', label: '🔒 Sommative', desc: 'Évaluation sommative — mode examen sécurisé, aucune aide', color: 'border-rose-300 bg-rose-50' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTpNature(opt.value)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${
                      tpNature === opt.value
                        ? opt.color + ' ring-2 ring-offset-1 ring-current'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-sm">{opt.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleStep1Submit}
                disabled={!title.trim() || createTP.isPending}
                className="flex items-center gap-2 bg-[#8B1A2E] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#6B1222] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createTP.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Suivant →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Énoncé du TP</h2>
            <p className="text-sm text-gray-500 mb-6">
              Rédigez l'énoncé manuellement ou laissez l'IA en générer un.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-blue-900 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Génération par IA
              </p>
              <input
                type="text"
                value={aiHint}
                onChange={(e) => setAiHint(e.target.value)}
                placeholder="Indice optionnel (ex. : manipulation de listes, tri à bulles…)"
                className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              />
              <button
                onClick={handleGenerateStatement}
                disabled={generateStatement.isPending}
                className="flex items-center gap-2 bg-[#1E40AF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1e3a8a] transition-colors disabled:opacity-50"
              >
                {generateStatement.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Générer par IA
              </button>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Énoncé</label>
              <textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                rows={12}
                placeholder="Rédigez l'énoncé du TP ici…"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A2E]/30 focus:border-[#8B1A2E] resize-y"
              />
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 border border-[#8B1A2E] text-[#8B1A2E] px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#8B1A2E]/5 transition-colors"
              >
                ← Précédent
              </button>
              <button
                onClick={handleStep2Submit}
                disabled={!statement.trim() || updateTP.isPending}
                className="flex items-center gap-2 bg-[#8B1A2E] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#6B1222] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateTP.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Utiliser cet énoncé →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Codes AA associés</h2>
            <p className="text-sm text-gray-500 mb-6">
              Associez les acquis d'apprentissage (AA) évalués par ce TP.
            </p>
            {aaCodes.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Codes sélectionnés</p>
                <div className="flex flex-wrap gap-2">
                  {aaCodes.map((code) => (
                    <span
                      key={code}
                      className="flex items-center gap-1 bg-[#8B1A2E]/10 text-[#8B1A2E] text-sm px-3 py-1 rounded-full font-medium"
                    >
                      {code}
                      <button onClick={() => removeAA(code)}>
                        <X className="w-3 h-3 ml-1" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 mb-6">
              <input
                type="text"
                value={customAAInput}
                onChange={(e) => setCustomAAInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomAA()}
                placeholder="Ajouter un code AA manuellement (ex. : AA1.2)"
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A2E]/30 focus:border-[#8B1A2E]"
              />
              <button
                onClick={addCustomAA}
                className="flex items-center gap-1 border border-[#8B1A2E] text-[#8B1A2E] px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#8B1A2E]/5 transition-colors"
              >
                <Plus className="w-4 h-4" /> Ajouter
              </button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-blue-900 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Suggestion IA
              </p>
              <button
                onClick={handleSuggestAA}
                disabled={suggestAA.isPending}
                className="flex items-center gap-2 bg-[#1E40AF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1e3a8a] transition-colors disabled:opacity-50"
              >
                {suggestAA.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Suggérer par IA
              </button>
              {aaJustification && (
                <p className="text-xs text-blue-700 mt-3 italic">{aaJustification}</p>
              )}
              {suggestedAA.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-blue-800 mb-2">Cochez les codes à inclure :</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedAA.map((code) => (
                      <label
                        key={code}
                        className="flex items-center gap-2 cursor-pointer bg-white border border-blue-200 rounded-full px-3 py-1 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSuggested.includes(code)}
                          onChange={() => toggleSuggestedAA(code)}
                          className="accent-[#1E40AF]"
                        />
                        <span className="font-medium text-blue-900">{code}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Barème */}
            <div className="border border-gray-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-800">📊 Barème (points par question)</p>
                <button
                  onClick={handleParseQuestions}
                  disabled={isParsing || !tpId}
                  className="flex items-center gap-2 bg-[#1E40AF] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#1e3a8a] transition-colors disabled:opacity-50"
                >
                  {isParsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Analyser l'énoncé
                </button>
              </div>
              {parsedQuestions.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Génération d'énoncé requise — cliquez sur &quot;Analyser l'énoncé&quot; pour extraire les questions.</p>
              ) : (
                <div className="space-y-3">
                  {parsedQuestions.map((q) => (
                    <div key={q.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">Q{q.id} — {q.title}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={questionPoints[q.id] ?? q.points}
                          onChange={(e) => handlePointsChange(q.id, Number(e.target.value))}
                          className="w-16 border border-gray-300 rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#8B1A2E]/30"
                        />
                        <span className="text-xs text-gray-500">pts</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1">
                    <span className="text-xs font-semibold text-gray-700">
                      Total : {Object.values(questionPoints).reduce((a, b) => a + b, 0)} pts
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 border border-[#8B1A2E] text-[#8B1A2E] px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#8B1A2E]/5 transition-colors"
              >
                ← Précédent
              </button>
              <button
                onClick={handleStep3Submit}
                disabled={updateTP.isPending}
                className="flex items-center gap-2 bg-[#8B1A2E] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#6B1222] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateTP.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Suivant →
              </button>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Correction de référence</h2>
            <p className="text-sm text-gray-500 mb-6">
              Définissez la solution de référence et les critères de correction avant de publier.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-blue-900 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Génération automatique
              </p>
              <button
                onClick={handleGenerateReference}
                disabled={generateReference.isPending}
                className="flex items-center gap-2 bg-[#1E40AF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1e3a8a] transition-colors disabled:opacity-50"
              >
                {generateReference.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Générer correction de référence
              </button>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Solution de référence</label>
              {referenceSolution ? (
                <>
                  <pre className="bg-gray-900 text-green-400 font-mono text-sm rounded-lg p-4 overflow-x-auto whitespace-pre-wrap mb-2">
                    {referenceSolution}
                  </pre>
                  <textarea
                    value={referenceSolution}
                    onChange={(e) => setReferenceSolution(e.target.value)}
                    rows={8}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#8B1A2E]/30 focus:border-[#8B1A2E] resize-y mt-2"
                    placeholder="Modifiez la solution si nécessaire…"
                  />
                </>
              ) : (
                <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-400 italic">
                  Aucune solution générée pour l'instant.
                </div>
              )}
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Critères de correction</label>
              <textarea
                value={correctionCriteria}
                onChange={(e) => setCorrectionCriteria(e.target.value)}
                rows={5}
                placeholder="Décrivez les critères de correction (barème, points clés…)"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A2E]/30 focus:border-[#8B1A2E] resize-y"
              />
            </div>
            <div className="flex items-center gap-3 mb-8 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <input
                id="validate-ref"
                type="checkbox"
                checked={referenceValidated}
                onChange={(e) => setReferenceValidated(e.target.checked)}
                className="w-4 h-4 accent-[#8B1A2E]"
              />
              <label htmlFor="validate-ref" className="text-sm text-amber-900 font-medium cursor-pointer">
                Je valide la correction de référence — l'IA s'en servira pour noter les étudiants
              </label>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 border border-[#8B1A2E] text-[#8B1A2E] px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#8B1A2E]/5 transition-colors"
              >
                ← Précédent
              </button>
              <button
                onClick={handlePublish}
                disabled={!referenceValidated || publishTP.isPending || updateTP.isPending}
                className="flex items-center gap-2 bg-[#8B1A2E] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#6B1222] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(publishTP.isPending || updateTP.isPending) && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <CheckCircle className="w-4 h-4" />
                Publier le TP
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
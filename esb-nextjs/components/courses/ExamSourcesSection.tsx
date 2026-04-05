'use client';

import { BookOpen, FileText, ExternalLink } from 'lucide-react';

export interface QuestionSource {
  document: string;
  page: string;
  excerpt: string;
  document_id?: number;
}

export interface QuestionWithSources {
  question_number: number;
  question_text_preview: string;
  aa?: string[];
  bloom_level?: string;
  sources?: QuestionSource[];
}

interface Props {
  questions: QuestionWithSources[];
}

function SourceCard({ source }: { source: QuestionSource }) {
  return (
    <div className="p-2 bg-gray-50 border border-gray-200 rounded text-xs">
      <div className="flex items-center gap-1 mb-1">
        <BookOpen className="w-3 h-3 text-blue-600" />
        <span className="font-medium text-gray-800">{source.document}</span>
        <span className="text-gray-500">• Page {source.page}</span>
      </div>
      {source.excerpt && (
        <p className="text-gray-600 italic line-clamp-2">&ldquo;{source.excerpt}&rdquo;</p>
      )}
    </div>
  );
}

export function ExamSourcesSection({ questions }: Props) {
  if (!questions || questions.length === 0) {
    return null;
  }

  const questionsWithSources = questions.filter(q => q.sources && q.sources.length > 0);

  if (questionsWithSources.length === 0) {
    return (
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          ℹ️ Aucune source n'a été détectée pour les questions de cette épreuve.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 p-4 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-green-600" />
        <h3 className="text-lg font-bold text-gray-800">🔍 Traçabilité des questions (RAG)</h3>
        <span className="ml-auto text-xs font-medium px-2 py-1 bg-green-100 text-green-700 rounded-full">
          {questionsWithSources.length} question{questionsWithSources.length > 1 ? 's' : ''} avec source
        </span>
      </div>

      <div className="space-y-3">
        {questionsWithSources.map((question) => (
          <div 
            key={question.question_number} 
            className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded">
                    Q{question.question_number}
                  </span>
                  {question.bloom_level && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                      {question.bloom_level}
                    </span>
                  )}
                  {question.aa && question.aa.length > 0 && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                      {question.aa.join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700 line-clamp-2">
                  {question.question_text_preview}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                📚 Sources détectées:
              </p>
              <div className="grid gap-2">
                {question.sources?.map((source, idx) => (
                  <SourceCard key={idx} source={source} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-white border border-green-200 rounded-lg">
        <p className="text-xs text-gray-600">
          💡 <strong>Note:</strong> Les sources sont détectées automatiquement via RAG (Retrieval Augmented Generation) 
          en analysant les documents du cours et des chapitres. Cela permet de vérifier que chaque question est bien 
          basée sur le contenu enseigné.
        </p>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen, Target, Brain, Zap, Clock } from 'lucide-react';

export interface QuestionWithSource {
  question_number: number;
  question_text_preview: string;
  aa?: string[];
  bloom_level?: string;
  difficulty?: string;
  points?: number;
  estimated_time?: number;
  type?: string;
  sources?: Array<{
    document: string;
    page: string;
    excerpt: string;
  }>;
}

interface Props {
  questions: QuestionWithSource[];
  totalPoints?: number;
}

const DIFFICULTY_COLORS = {
  'Très facile': 'bg-green-100 text-green-700',
  'Facile': 'bg-green-100 text-green-700',
  'Moyen': 'bg-yellow-100 text-yellow-700',
  'Difficile': 'bg-orange-100 text-orange-700',
  'Très difficile': 'bg-red-100 text-red-700',
  'unknown': 'bg-gray-100 text-gray-600'
};

const BLOOM_COLORS = {
  'remembering': 'bg-blue-100 text-blue-700',
  'understanding': 'bg-cyan-100 text-cyan-700',
  'applying': 'bg-green-100 text-green-700',
  'analyzing': 'bg-yellow-100 text-yellow-700',
  'evaluating': 'bg-orange-100 text-orange-700',
  'creating': 'bg-red-100 text-red-700',
  'unknown': 'bg-gray-100 text-gray-600'
};

const BLOOM_LABELS = {
  'remembering': 'Mémoriser',
  'understanding': 'Comprendre',
  'applying': 'Appliquer',
  'analyzing': 'Analyser',
  'evaluating': 'Évaluer',
  'creating': 'Créer',
  'unknown': 'N/A'
};

function ExerciseHeader({ title, points }: { title: string; points: number }) {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-3 mb-2">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-blue-900">{title}</h3>
        <span className="px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded-full">
          {points} pts
        </span>
      </div>
    </div>
  );
}

function QuestionRow({ question, index }: { question: QuestionWithSource; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const difficultyColor = DIFFICULTY_COLORS[question.difficulty as keyof typeof DIFFICULTY_COLORS] || DIFFICULTY_COLORS.unknown;
  const bloomColor = BLOOM_COLORS[question.bloom_level as keyof typeof BLOOM_COLORS] || BLOOM_COLORS.unknown;
  const bloomLabel = BLOOM_LABELS[question.bloom_level as keyof typeof BLOOM_LABELS] || question.bloom_level;

  return (
    <>
      <tr className="hover:bg-gray-50 border-b border-gray-200 transition-colors">
        <td className="px-4 py-3 text-center font-semibold text-gray-700">
          {question.question_number}
        </td>
        <td className="px-4 py-3">
          <div className="max-w-md">
            <p className="text-sm text-gray-800 line-clamp-2">
              {question.question_text_preview}
            </p>
            {question.sources && question.sources.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-1 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <BookOpen className="w-3 h-3" />
                {question.sources.length} source(s)
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {question.aa && question.aa.length > 0 ? (
              question.aa.map((aa, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded"
                >
                  {aa}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-400">N/A</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="font-semibold text-gray-800">
            {question.points || '-'}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${difficultyColor}`}>
            {question.difficulty || 'N/A'}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${bloomColor}`}>
            {bloomLabel}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
            {question.type || 'Ouvert'}
          </span>
        </td>
        <td className="px-4 py-3 text-center text-sm text-gray-600">
          <div className="flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" />
            {question.estimated_time ? `${question.estimated_time} min` : '-'}
          </div>
        </td>
      </tr>
      {expanded && question.sources && question.sources.length > 0 && (
        <tr className="bg-blue-50">
          <td colSpan={8} className="px-4 py-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700 uppercase">📚 Sources documentaires:</p>
              {question.sources.map((src, i) => (
                <div key={i} className="p-2 bg-white border border-blue-200 rounded text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-3 h-3 text-blue-600" />
                    <span className="font-medium text-gray-800">{src.document}</span>
                    <span className="text-gray-500">• Page {src.page}</span>
                  </div>
                  {src.excerpt && (
                    <p className="text-gray-600 italic pl-5">&ldquo;{src.excerpt}&rdquo;</p>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ExamQuestionsTable({ questions, totalPoints }: Props) {
  if (!questions || questions.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>Aucune question détectée</p>
      </div>
    );
  }

  // Group questions by exercise (if they have exercise info)
  const groupedQuestions: { [key: string]: QuestionWithSource[] } = {};
  questions.forEach(q => {
    // Try to detect exercise from question text
    const match = q.question_text_preview?.match(/^(Exercice \d+)/i);
    const exerciseKey = match ? match[1] : 'Questions';
    if (!groupedQuestions[exerciseKey]) {
      groupedQuestions[exerciseKey] = [];
    }
    groupedQuestions[exerciseKey].push(q);
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-white" />
            <h2 className="text-xl font-bold text-white">Tableau récapitulatif des questions</h2>
          </div>
          <div className="px-4 py-2 bg-white bg-opacity-20 rounded-lg">
            <span className="text-2xl font-bold text-white">{questions.length}</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                #
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Question
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                AA
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Barème
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Difficulté
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Bloom
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Temps
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedQuestions).map(([exercise, exerciseQuestions]) => (
              <React.Fragment key={exercise}>
                {exercise !== 'Questions' && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <ExerciseHeader
                        title={exercise}
                        points={exerciseQuestions.reduce((sum, q) => sum + (q.points || 0), 0)}
                      />
                    </td>
                  </tr>
                )}
                {exerciseQuestions.map((question, idx) => (
                  <QuestionRow
                    key={question.question_number}
                    question={question}
                    index={idx}
                  />
                ))}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot className="bg-gray-100 border-t-2 border-gray-300">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-800">
                Total
              </td>
              <td className="px-4 py-3 text-center font-bold text-lg text-indigo-600">
                {totalPoints || questions.reduce((sum, q) => sum + (q.points || 0), 0)} pts
              </td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

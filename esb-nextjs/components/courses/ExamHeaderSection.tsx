'use client';

import { useState } from 'react';
import { FileText, Loader2, Download } from 'lucide-react';
import { ExamMetadata } from '@/lib/types/course';

interface Props {
  examId: number;
  courseId: number;
  initialHeader?: ExamMetadata;
  onHeaderUpdated?: (header: ExamMetadata) => void;
}

export function ExamHeaderSection({ examId, courseId, initialHeader, onHeaderUpdated }: Props) {
  const [header, setHeader] = useState<ExamMetadata | undefined>(initialHeader);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtractHeader = async () => {
    setIsExtracting(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/courses/${courseId}/exam/${examId}/extract-header`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Extraction failed');
      }

      const data = await response.json();
      setHeader(data.header);
      
      if (onHeaderUpdated) {
        onHeaderUpdated(data.header);
      }

      alert('✅ En-tête extrait avec succès!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de l\'extraction';
      setError(errorMessage);
      alert(`❌ ${errorMessage}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h${mins.toString().padStart(2, '0')}`;
    if (hours > 0) return `${hours}h`;
    return `${mins} min`;
  };

  const formatBoolean = (value: boolean | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return value ? 'OUI' : 'NON';
  };

  return (
    <div className="rounded-xl border-2 border-indigo-300 bg-white shadow-lg overflow-hidden">
      {/* Header with extraction button */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-7 h-7 text-white" />
            <div>
              <h2 className="text-2xl font-bold text-white">En-tête de l&apos;épreuve</h2>
              <p className="text-sm text-indigo-100">Extraction automatique par IA (Gemini 2.5 Pro)</p>
            </div>
          </div>
          <button
            onClick={handleExtractHeader}
            disabled={isExtracting}
            className="px-5 py-2.5 bg-white text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-semibold"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Extraction en cours...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                {header ? 'Réextraire les informations' : 'Extraire les informations du header'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Table - Always visible */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b-2 border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-1/4">
                Champ
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Valeur
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Nom de l'épreuve */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                📚 Nom de l&apos;épreuve (Module)
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {header?.exam_name || <span className="text-gray-400 italic">Non renseigné</span>}
              </td>
            </tr>

            {/* Classe */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                👥 Classe
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {header?.class_name || <span className="text-gray-400 italic">Non renseigné</span>}
              </td>
            </tr>

            {/* Durée */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                ⏰ Durée de l&apos;épreuve
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {header?.declared_duration_min ? (
                  <span className="font-semibold text-indigo-600">
                    {formatDuration(header.declared_duration_min)}
                  </span>
                ) : (
                  <span className="text-gray-400 italic">Non renseigné</span>
                )}
              </td>
            </tr>

            {/* Date */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                📅 Date de l&apos;examen
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {header?.exam_date || <span className="text-gray-400 italic">Non renseigné</span>}
              </td>
            </tr>

            {/* Nombre de pages */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                📄 Nombre de pages
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {header?.num_pages || <span className="text-gray-400 italic">Non renseigné</span>}
              </td>
            </tr>

            {/* Langue */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                🌐 Langue utilisée
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {header?.language || <span className="text-gray-400 italic">Non renseigné</span>}
              </td>
            </tr>

            {/* Enseignants */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                👨‍🏫 Enseignant(s)
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {header?.instructors && header.instructors.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {header.instructors.map((instructor, idx) => (
                      <span key={idx} className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs font-medium">
                        {instructor}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 italic">Non renseigné</span>
                )}
              </td>
            </tr>

            {/* Documents autorisés */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                📚 Documents autorisés
              </td>
              <td className="px-6 py-4 text-sm">
                <span className={`font-semibold ${
                  header?.documents_allowed === true ? 'text-green-600' :
                  header?.documents_allowed === false ? 'text-red-600' :
                  'text-gray-400'
                }`}>
                  {formatBoolean(header?.documents_allowed)}
                </span>
              </td>
            </tr>

            {/* Calculatrice autorisée */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                🧮 Calculatrice autorisée
              </td>
              <td className="px-6 py-4 text-sm">
                <span className={`font-semibold ${
                  header?.calculator_allowed === true ? 'text-green-600' :
                  header?.calculator_allowed === false ? 'text-red-600' :
                  'text-gray-400'
                }`}>
                  {formatBoolean(header?.calculator_allowed)}
                </span>
              </td>
            </tr>

            {/* PC autorisé */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                💻 PC autorisé
              </td>
              <td className="px-6 py-4 text-sm">
                <span className={`font-semibold ${
                  header?.computer_allowed === true ? 'text-green-600' :
                  header?.computer_allowed === false ? 'text-red-600' :
                  'text-gray-400'
                }`}>
                  {formatBoolean(header?.computer_allowed)}
                </span>
              </td>
            </tr>

            {/* Internet autorisé */}
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                📡 Internet autorisé
              </td>
              <td className="px-6 py-4 text-sm">
                <span className={`font-semibold ${
                  header?.internet_allowed === true ? 'text-green-600' :
                  header?.internet_allowed === false ? 'text-red-600' :
                  'text-gray-400'
                }`}>
                  {formatBoolean(header?.internet_allowed)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
        <p className="text-xs text-gray-600">
          💡 <strong>Note:</strong> Les informations sont extraites automatiquement de l&apos;en-tête du PDF par Gemini 2.5 Pro.
          {!header && " Cliquez sur 'Extraire les informations du header' pour remplir le tableau."}
        </p>
      </div>
    </div>
  );
}

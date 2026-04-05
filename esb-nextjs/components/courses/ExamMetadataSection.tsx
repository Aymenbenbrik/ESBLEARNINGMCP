'use client';

import { CheckCircle2, XCircle, Calculator, BookOpen, Laptop, Wifi, Clock, Calendar, Users, FileText } from 'lucide-react';

export interface ExamMetadata {
  exam_name?: string;
  class_name?: string;
  language?: string;
  declared_duration_min?: number;
  exam_date?: string;
  instructors?: string[];
  num_pages?: number;
  exam_type?: string;
  answer_on_sheet?: boolean | null;
  calculator_allowed?: boolean | null;
  computer_allowed?: boolean | null;
  internet_allowed?: boolean | null;
  documents_allowed?: boolean | null;
  department?: string;
}

interface Props {
  metadata: ExamMetadata;
}

function MetadataItem({ 
  icon, 
  label, 
  value, 
  allowed 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value?: string | number | null;
  allowed?: boolean | null;
}) {
  if (allowed !== undefined && allowed !== null) {
    return (
      <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="text-gray-600">{icon}</div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          {allowed ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="text-sm font-semibold text-green-600">Autorisé</span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-semibold text-red-600">Non autorisé</span>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!value && value !== 0) return null;

  return (
    <div className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg">
      <div className="text-gray-600">{icon}</div>
      <div className="flex flex-col">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-sm font-semibold text-gray-800">{value}</span>
      </div>
    </div>
  );
}

export function ExamMetadataSection({ metadata }: Props) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h${mins.toString().padStart(2, '0')}`;
    if (hours > 0) return `${hours}h`;
    return `${mins} min`;
  };

  return (
    <div className="mt-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-bold text-gray-800">📋  de l'épreuve</h3>
      </div>

      {/* Informations générales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <MetadataItem 
          icon={<BookOpen className="w-4 h-4" />}
          label="Nom de l'épreuve"
          value={metadata.exam_name}
        />
        <MetadataItem 
          icon={<Users className="w-4 h-4" />}
          label="Classe"
          value={metadata.class_name}
        />
        <MetadataItem 
          icon={<Clock className="w-4 h-4" />}
          label="Durée"
          value={formatDuration(metadata.declared_duration_min)}
        />
        <MetadataItem 
          icon={<Calendar className="w-4 h-4" />}
          label="Date"
          value={metadata.exam_date}
        />
        {metadata.instructors && metadata.instructors.length > 0 && (
          <MetadataItem 
            icon={<Users className="w-4 h-4" />}
            label="Enseignant(s)"
            value={metadata.instructors.join(', ')}
          />
        )}
        {metadata.num_pages && (
          <MetadataItem 
            icon={<FileText className="w-4 h-4" />}
            label="Nombre de pages"
            value={metadata.num_pages}
          />
        )}
      </div>

      {/* Autorisations */}
      <div className="pt-3 border-t border-blue-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">🔐 Autorisations</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {metadata.calculator_allowed !== null && metadata.calculator_allowed !== undefined && (
            <MetadataItem 
              icon={<Calculator className="w-4 h-4" />}
              label="Calculatrice"
              allowed={metadata.calculator_allowed}
            />
          )}
          {metadata.documents_allowed !== null && metadata.documents_allowed !== undefined && (
            <MetadataItem 
              icon={<BookOpen className="w-4 h-4" />}
              label="Documents"
              allowed={metadata.documents_allowed}
            />
          )}
          {metadata.computer_allowed !== null && metadata.computer_allowed !== undefined && (
            <MetadataItem 
              icon={<Laptop className="w-4 h-4" />}
              label="Ordinateur"
              allowed={metadata.computer_allowed}
            />
          )}
          {metadata.internet_allowed !== null && metadata.internet_allowed !== undefined && (
            <MetadataItem 
              icon={<Wifi className="w-4 h-4" />}
              label="Internet"
              allowed={metadata.internet_allowed}
            />
          )}
        </div>
      </div>

      {/* Type et langue */}
      {(metadata.exam_type || metadata.language) && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <div className="flex flex-wrap gap-2">
            {metadata.exam_type && (
              <span className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                📝 {metadata.exam_type}
              </span>
            )}
            {metadata.language && (
              <span className="px-3 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
                🌐 {metadata.language}
              </span>
            )}
            {metadata.answer_on_sheet === true && (
              <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                📄 Réponses sur feuille d'examen
              </span>
            )}
            {metadata.answer_on_sheet === false && (
              <span className="px-3 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-full">
                📋 Réponses sur copie séparée
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

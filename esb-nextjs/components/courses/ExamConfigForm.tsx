'use client';

import { useState } from 'react';
import { Upload, FlaskConical, BookOpen, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExamType, EXAM_TYPE_LABELS, TNAADistribution } from '@/lib/types/course';
import { ExamUploadConfig } from '@/lib/api/courses';

interface Props {
  onConfirm: (file: File, config: ExamUploadConfig) => void;
  isLoading?: boolean;
  courseAAs?: TNAADistribution[];
}

const EXAM_TYPE_OPTIONS: { value: ExamType; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    value: 'examen',
    label: EXAM_TYPE_LABELS.examen,
    icon: <BookOpen className="h-5 w-5" />,
    desc: 'Épreuve finale couvrant tout le programme',
  },
  {
    value: 'ds',
    label: EXAM_TYPE_LABELS.ds,
    icon: <FileText className="h-5 w-5" />,
    desc: 'Évaluation intermédiaire sur une partie du cours',
  },
  {
    value: 'pratique',
    label: EXAM_TYPE_LABELS.pratique,
    icon: <FlaskConical className="h-5 w-5" />,
    desc: 'TP, manipulations, code ou exercices appliqués',
  },
];

export function ExamConfigForm({ onConfirm, isLoading, courseAAs = [] }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [examType, setExamType] = useState<ExamType>('examen');
  const [weight, setWeight] = useState(30);
  const [hasPractical, setHasPractical] = useState(false);
  const [selectedAAs, setSelectedAAs] = useState<number[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const toggleAA = (num: number) => {
    setSelectedAAs(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const handleSubmit = () => {
    if (!file) return;
    onConfirm(file, {
      examType,
      weight,
      targetAaIds: selectedAAs,
      hasPracticalTarget: hasPractical,
    });
  };

  return (
    <div className="space-y-6">
      {/* Type d'épreuve */}
      <div>
        <h4 className="text-sm font-semibold mb-3">1. Type d&apos;épreuve</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          {EXAM_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setExamType(opt.value)}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                examType === opt.value
                  ? 'border-bolt-accent bg-bolt-accent/5'
                  : 'border-bolt-line bg-white hover:border-gray-300'
              }`}
            >
              <div className={`mb-2 ${examType === opt.value ? 'text-bolt-accent' : 'text-muted-foreground'}`}>
                {opt.icon}
              </div>
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Pondération + Questions pratiques */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold mb-2">2. Pondération (%)</h4>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={weight}
              onChange={e => setWeight(Number(e.target.value))}
              className="flex-1 accent-bolt-accent"
            />
            <span className="text-2xl font-bold w-14 text-right">{weight}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Part de cette épreuve dans la note finale
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">3. Questions pratiques</h4>
          <button
            type="button"
            onClick={() => setHasPractical(p => !p)}
            className={`flex items-center gap-3 rounded-xl border-2 p-3 w-full transition-all ${
              hasPractical
                ? 'border-orange-400 bg-orange-50'
                : 'border-bolt-line bg-white hover:border-gray-300'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
              hasPractical ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
            }`}>
              {hasPractical && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">
                {hasPractical ? 'Épreuve avec questions pratiques' : 'Épreuve théorique uniquement'}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasPractical ? 'TP, code, manipulations attendus' : 'Cliquer pour activer les questions pratiques'}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* AAs à valider */}
      {courseAAs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">4. Acquis d&apos;Apprentissage à valider</h4>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedAAs(courseAAs.map(a => a.number))}
                className="text-xs text-bolt-accent hover:underline"
              >
                Tous
              </button>
              <span className="text-xs text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() => setSelectedAAs([])}
                className="text-xs text-muted-foreground hover:underline"
              >
                Aucun
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {courseAAs.map(aa => (
              <button
                key={aa.number}
                type="button"
                onClick={() => toggleAA(aa.number)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedAAs.includes(aa.number)
                    ? 'border-bolt-accent bg-bolt-accent/10 text-bolt-accent'
                    : 'border-bolt-line bg-white text-muted-foreground hover:border-gray-300'
                }`}
              >
                AA{aa.number}
                {selectedAAs.includes(aa.number) && ' ✓'}
              </button>
            ))}
          </div>
          {selectedAAs.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {selectedAAs.length} AA sélectionné{selectedAAs.length > 1 ? 's' : ''} sur {courseAAs.length}
            </p>
          )}
          {selectedAAs.length === 0 && (
            <p className="text-xs text-amber-600 mt-2">
              ⚠ Aucun AA sélectionné — l&apos;IA analysera tous les AA du cours
            </p>
          )}
        </div>
      )}

      {/* Upload fichier */}
      <div>
        <h4 className="text-sm font-semibold mb-2">
          {courseAAs.length > 0 ? '5.' : '4.'} Fichier de l&apos;épreuve
        </h4>
        {file ? (
          <div className="flex items-center justify-between rounded-xl border border-bolt-line bg-white p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} Ko</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Prêt</Badge>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs text-muted-foreground hover:text-red-500"
              >
                Changer
              </button>
            </div>
          </div>
        ) : (
          <label className="block w-full border-2 border-dashed border-bolt-line rounded-xl p-6 text-center hover:border-bolt-accent hover:bg-muted/10 transition-colors cursor-pointer">
            <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Cliquez pour choisir un fichier</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, DOCX ou TXT</p>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        )}
      </div>

      {/* Résumé + Bouton */}
      <div className="flex items-center justify-between pt-2 border-t border-bolt-line">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{EXAM_TYPE_LABELS[examType]}</Badge>
          <Badge variant="outline">{weight}%</Badge>
          {hasPractical && <Badge className="bg-orange-100 text-orange-800 border-orange-200">Pratique</Badge>}
          {selectedAAs.length > 0 && (
            <Badge variant="outline">{selectedAAs.length} AA ciblé{selectedAAs.length > 1 ? 's' : ''}</Badge>
          )}
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!file || isLoading}
        >
          <Upload className="h-4 w-4 mr-1" />
          {isLoading ? 'Upload en cours...' : 'Uploader l\'épreuve'}
        </Button>
      </div>
    </div>
  );
}

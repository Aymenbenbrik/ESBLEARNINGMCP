'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Wand2, FileDown, Upload, Eye, Code2, RefreshCw, X, ImagePlus, Info,
  ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGenerateExamLatex, useCompileExamLatex } from '@/lib/hooks/useCourses';
import { toast } from 'sonner';

interface Props {
  courseId: number;
  examId: number;
  /** Pre-seeded LaTeX from AI proposals (optional) */
  initialLatex?: string;
}

const LATEX_TOOLBAR = [
  { label: 'Fraction', insert: '\\frac{num}{den}' },
  { label: 'Somme', insert: '\\sum_{i=1}^{n}' },
  { label: 'Intégrale', insert: '\\int_{a}^{b} f(x)\\,dx' },
  { label: 'Racine', insert: '\\sqrt{x}' },
  { label: 'Alpha/Bêta', insert: '\\alpha, \\beta, \\gamma' },
  { label: 'Infini', insert: '\\infty' },
  { label: 'Vecteur', insert: '\\vec{v}' },
  { label: 'Matrice', insert: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'Énumération', insert: '\\begin{enumerate}\n  \\item \n\\end{enumerate}' },
  { label: 'Figure', insert: '\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.5\\textwidth]{image.png}\n  \\caption{Légende}\n\\end{figure}' },
];

const DEFAULT_LATEX = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[french]{babel}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{geometry}
\\geometry{margin=2.5cm}
\\usepackage{graphicx}
\\usepackage{enumitem}

\\begin{document}

\\begin{center}
  {\\LARGE\\bfseries Épreuve}\\\\[8pt]
  {\\large Cours :}\\\\[4pt]
  Durée : 2h \\quad Date : \\today\\\\[4pt]
  {\\small Documents non autorisés. Calculatrice autorisée.}
\\end{center}

\\hrule
\\vspace{1em}

\\section*{Exercice 1 — (X points)}

\\begin{enumerate}[label=\\textbf{\\arabic*.}]
  \\item Première question.
  \\item Deuxième question.
\\end{enumerate}

\\section*{Exercice 2 — (X points)}

\\begin{enumerate}[label=\\textbf{\\arabic*.}]
  \\item Première question.
\\end{enumerate}

\\vspace{2em}
\\hrule
\\vspace{0.5em}
{\\small\\textbf{Barème :} Ex.1 : X pts \\quad Ex.2 : X pts \\quad Total : 20 pts}

\\end{document}`;

export function ExamLatexEditor({ courseId, examId, initialLatex }: Props) {
  const [latex, setLatex] = useState(initialLatex ?? DEFAULT_LATEX);
  const [mode, setMode] = useState<'edit' | 'help'>('edit');
  const [showHelp, setShowHelp] = useState(false);
  const [compileLogs, setCompileLogs] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const generateLatex = useGenerateExamLatex(courseId);
  const compilePdf = useCompileExamLatex(courseId);

  // Insert snippet at cursor position
  const insertSnippet = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = latex.slice(0, start) + snippet + latex.slice(end);
    setLatex(newVal);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + snippet.length;
    }, 0);
  }, [latex]);

  // Handle figure upload → embed as base64 comment
  const handleFigureUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string)?.split(',')[1];
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      // Add a note in LaTeX — actual embedding would require base64 package
      const snippet = `% Figure: ${file.name} (base64 data below – save to disk and reference by path)\n% \\includegraphics{${file.name}}\n`;
      insertSnippet(snippet);
      // Also trigger download so teacher saves the figure alongside their .tex file
      const a = document.createElement('a');
      a.href = `data:image/${ext};base64,${base64}`;
      a.download = file.name;
      a.click();
      toast.success(`Figure "${file.name}" prête — téléchargée pour utilisation avec \\includegraphics`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [insertSnippet]);

  // AI: generate full LaTeX based on exam analysis
  const handleGenerate = () => {
    generateLatex.mutate(
      { examId, includeProposals: true },
      {
        onSuccess: (code) => {
          setLatex(code);
          toast.success('Document LaTeX généré par IA ✓');
        },
      }
    );
  };

  // Compile to PDF and trigger download
  const handleCompile = () => {
    setCompileLogs(null);
    compilePdf.mutate(
      { examId, latex },
      {
        onSuccess: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `examen_${examId}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success('PDF téléchargé ✓');
        },
        onError: (error: any) => {
          const log = error.response?.data?.log ?? error.message ?? 'Erreur inconnue';
          setCompileLogs(log);
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          disabled={generateLatex.isPending}
          className="gap-1.5"
        >
          {generateLatex.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Wand2 className="h-3.5 w-3.5 text-violet-600" />}
          Générer avec l&apos;IA
        </Button>

        {/* Figure upload */}
        <label className="cursor-pointer">
          <input type="file" accept="image/*" className="sr-only" onChange={handleFigureUpload} />
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted transition-colors">
            <ImagePlus className="h-3.5 w-3.5 text-blue-500" />
            Ajouter figure
          </span>
        </label>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowHelp(h => !h)}
          className="gap-1.5"
        >
          <Code2 className="h-3.5 w-3.5" />
          Commandes LaTeX
          {showHelp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>

        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLatex(DEFAULT_LATEX)}
            className="gap-1.5"
            title="Réinitialiser au modèle par défaut"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Réinitialiser
          </Button>
          <Button
            size="sm"
            onClick={handleCompile}
            disabled={compilePdf.isPending}
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
          >
            {compilePdf.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileDown className="h-3.5 w-3.5" />}
            Compiler & Télécharger PDF
          </Button>
        </div>
      </div>

      {/* LaTeX quick-insert toolbar */}
      {showHelp && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Cliquez pour insérer au curseur
          </p>
          <div className="flex flex-wrap gap-1.5">
            {LATEX_TOOLBAR.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => insertSnippet(item.insert)}
                className="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-white border border-blue-200 hover:bg-blue-100 transition-colors text-blue-800"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor area */}
      <div className="rounded-xl border border-bolt-line overflow-hidden bg-[#1e1e2e] shadow-md">
        {/* Editor header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#181825] border-b border-[#313244]">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/70" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <span className="w-3 h-3 rounded-full bg-green-500/70" />
            </div>
            <span className="text-xs text-[#a6adc8] font-mono ml-2">exam.tex</span>
          </div>
          <Badge className="text-[10px] bg-[#313244] text-[#cdd6f4] border-[#45475a]">LaTeX</Badge>
        </div>

        <textarea
          ref={textareaRef}
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          spellCheck={false}
          className="w-full min-h-[500px] p-4 font-mono text-sm bg-[#1e1e2e] text-[#cdd6f4] outline-none resize-y leading-relaxed"
          style={{ tabSize: 2 }}
          onKeyDown={(e) => {
            // Tab key → insert spaces
            if (e.key === 'Tab') {
              e.preventDefault();
              insertSnippet('  ');
            }
          }}
        />
      </div>

      {/* Compile logs */}
      {compileLogs && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-red-700">Journal de compilation pdflatex</p>
            <button onClick={() => setCompileLogs(null)}>
              <X className="h-4 w-4 text-red-500" />
            </button>
          </div>
          <pre className="text-xs text-red-600 whitespace-pre-wrap break-all max-h-48 overflow-y-auto font-mono">
            {compileLogs}
          </pre>
        </div>
      )}

      {/* Help tip */}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 shrink-0" />
        La compilation utilise <span className="font-mono">pdflatex</span> (MiKTeX) côté serveur.
        Assurez-vous que les images référencées sont dans le même dossier ou utilisez des chemins absolus.
      </p>
    </div>
  );
}

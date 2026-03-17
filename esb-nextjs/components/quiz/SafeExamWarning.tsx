'use client';

import { ViolationType } from '@/lib/types/quiz';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

const violationLabels: Record<ViolationType, string> = {
  fullscreen_exit: 'You exited fullscreen mode',
  copy: 'You attempted to copy content (Ctrl+C)',
  paste: 'You attempted to paste content (Ctrl+V)',
  tab_switch: 'You switched tabs or left the exam window',
  right_click: 'You right-clicked during the exam',
  print_screen: 'You pressed the Print Screen key',
  select_all: 'You attempted to select all content (Ctrl+A)',
};

interface SafeExamWarningProps {
  violationType: ViolationType | null;
  onAcknowledge: () => void;
}

export function SafeExamWarning({ violationType, onAcknowledge }: SafeExamWarningProps) {
  const description = violationType ? violationLabels[violationType] : 'A violation was detected';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      // Prevent closing by clicking outside
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-8 text-center">
        <div className="flex justify-center mb-4">
          <AlertTriangle className="h-16 w-16 text-yellow-500" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">Violation Detected</h2>

        <p className="text-base text-gray-700 mb-4 font-medium">{description}</p>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-800 font-semibold">
            This is your ONLY warning.
          </p>
          <p className="text-sm text-red-700 mt-1">
            Another violation will permanently disqualify you from this exam with a score of 0.
          </p>
        </div>

        <Button
          onClick={onAcknowledge}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3"
          size="lg"
        >
          I understand — Resume Quiz
        </Button>
      </div>
    </div>
  );
}

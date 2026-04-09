'use client';

import { AlertTriangle } from 'lucide-react';

export function TeacherPreviewBanner() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm">
      <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
      <div>
        <p className="text-sm font-semibold text-amber-800">
          MODE VÉRIFICATION
        </p>
        <p className="text-xs text-amber-700">
          Les résultats ne seront pas comptabilisés
        </p>
      </div>
    </div>
  );
}

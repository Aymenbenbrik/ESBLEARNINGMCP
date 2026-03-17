'use client';

import { useState } from 'react';
import { useSectionContent, useGenerateSectionContent, useUpdateSectionContent } from '@/lib/hooks/useReferences';
import { SectionContent } from '@/lib/types/references';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, CheckCircle2, XCircle, Pencil, Eye } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface SectionContentPanelProps {
  sectionId: number;
  canEdit: boolean;
}

const STATUS_CONFIG = {
  pending: { label: 'En attente', variant: 'secondary' as const, color: 'text-yellow-600' },
  approved: { label: 'Approuvé ✓', variant: 'default' as const, color: 'text-emerald-600' },
  rejected: { label: 'Rejeté', variant: 'destructive' as const, color: 'text-red-600' },
};

function ContentDisplay({
  content,
  isEditing,
  editValue,
  onEditChange,
}: {
  content: string;
  isEditing: boolean;
  editValue: string;
  onEditChange: (v: string) => void;
}) {
  if (isEditing) {
    return (
      <Textarea
        value={editValue}
        onChange={(e) => onEditChange(e.target.value)}
        rows={16}
        className="rounded-[12px] font-mono text-sm"
      />
    );
  }
  return (
    <div className="prose prose-sm max-w-none rounded-[12px] bg-gray-50 p-4 text-sm">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

export function SectionContentPanel({ sectionId, canEdit }: SectionContentPanelProps) {
  const { data: contentData, isLoading } = useSectionContent(sectionId);
  const generateMutation = useGenerateSectionContent();
  const updateMutation = useUpdateSectionContent();

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleGenerate = () => {
    generateMutation.mutate(sectionId, {
      onSuccess: () => setExpanded(true),
    });
  };

  const handleEdit = () => {
    setEditValue(contentData?.content ?? '');
    setIsEditing(true);
    setExpanded(true);
  };

  const handleSaveEdit = () => {
    updateMutation.mutate(
      { sectionId, data: { content: editValue } },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  const handleApprove = () => {
    updateMutation.mutate({ sectionId, data: { status: 'approved' } });
  };

  const handleReject = () => {
    updateMutation.mutate({ sectionId, data: { status: 'rejected' } });
  };

  if (isLoading) {
    return <Skeleton className="h-8 w-48 rounded-full" />;
  }

  const sc = contentData as SectionContent | null;
  const statusCfg = sc ? STATUS_CONFIG[sc.status] : null;
  const isGenerating = generateMutation.isPending;

  return (
    <div className="mt-3 rounded-[16px] border border-bolt-line bg-white">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-bolt-accent" />
          <span className="text-sm font-semibold">Contenu IA</span>
          {statusCfg && (
            <Badge variant={statusCfg.variant} className="text-xs">
              {statusCfg.label}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sc && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <Eye className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
              {expanded ? 'Masquer' : 'Afficher'}
            </Button>
          )}

          {canEdit && (
            <>
              {sc && !isEditing && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={handleEdit}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Modifier
                </Button>
              )}

              {isEditing && (
                <>
                  <Button
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={handleSaveEdit}
                    disabled={updateMutation.isPending}
                  >
                    Enregistrer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => setIsEditing(false)}
                  >
                    Annuler
                  </Button>
                </>
              )}

              {sc && sc.status === 'pending' && !isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full border-emerald-400 px-3 text-xs text-emerald-700 hover:bg-emerald-50"
                    onClick={handleApprove}
                    disabled={updateMutation.isPending}
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full border-red-400 px-3 text-xs text-red-600 hover:bg-red-50"
                    onClick={handleReject}
                    disabled={updateMutation.isPending}
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" />
                    Rejeter
                  </Button>
                </>
              )}

              <Button
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                {isGenerating ? 'Génération...' : sc ? 'Regénérer' : 'Générer'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content area */}
      {expanded && sc && (
        <div className="border-t border-bolt-line px-4 pb-4 pt-4">
          <ContentDisplay
            content={sc.content}
            isEditing={isEditing}
            editValue={editValue}
            onEditChange={setEditValue}
          />
        </div>
      )}

      {/* Student view: only show approved content */}
      {!canEdit && sc && sc.status === 'approved' && (
        <div className="border-t border-bolt-line px-4 pb-4 pt-4">
          <div className="prose prose-sm max-w-none text-sm">
            <ReactMarkdown>{sc.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { usePublishFeedbacks } from '@/lib/hooks/useExamBank';
import type { ExamSession } from '@/lib/types/exam-bank';
import { toast } from 'sonner';
import { Send } from 'lucide-react';

interface Props {
  examId: number;
  sessions: ExamSession[];
  onClose: () => void;
  onPublished: () => void;
}

export function PublishFeedbacksModal({ examId, sessions, onClose, onPublished }: Props) {
  const gradedSessions = sessions.filter(s => s.status === 'graded');
  const [selected, setSelected] = useState<Set<number>>(new Set(gradedSessions.map(s => s.id)));
  const [message, setMessage] = useState('');
  const publishMut = usePublishFeedbacks(examId);

  const toggle = (id: number) =>
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const handlePublish = async () => {
    if (selected.size === 0) return toast.error('Sélectionnez au moins un étudiant');
    try {
      const res = await publishMut.mutateAsync({ session_ids: Array.from(selected), message });
      toast.success(`${(res as { published_count: number }).published_count} feedback(s) publiés`);
      onPublished();
      onClose();
    } catch {
      toast.error('Erreur lors de la publication');
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publier les feedbacks</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between text-sm">
            <span>{gradedSessions.length} étudiant(s) corrigé(s)</span>
            <button
              className="text-blue-600 text-xs underline"
              onClick={() =>
                setSelected(
                  selected.size === gradedSessions.length
                    ? new Set()
                    : new Set(gradedSessions.map(s => s.id))
                )
              }
            >
              {selected.size === gradedSessions.length ? 'Désélectionner tout' : 'Tout sélectionner'}
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
            {gradedSessions.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/30">
                <Checkbox
                  id={`s-${s.id}`}
                  checked={selected.has(s.id)}
                  onCheckedChange={() => toggle(s.id)}
                />
                <Label htmlFor={`s-${s.id}`} className="flex-1 cursor-pointer text-sm">
                  {s.student_name ?? `Étudiant #${s.student_id}`}
                </Label>
                <Badge variant={s.score != null ? 'default' : 'secondary'} className="text-xs">
                  {s.score != null ? `${s.score}/${s.max_score}` : 'Non noté'}
                </Badge>
              </div>
            ))}
          </div>
          <div>
            <Label className="text-xs">Message global (optionnel)</Label>
            <Textarea
              rows={3}
              placeholder="Message à envoyer avec les feedbacks..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="text-sm mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handlePublish} disabled={publishMut.isPending || selected.size === 0}>
            <Send className="h-4 w-4 mr-2" />
            Publier ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

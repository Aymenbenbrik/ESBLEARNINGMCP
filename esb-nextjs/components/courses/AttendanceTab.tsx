'use client';

import { useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAttendanceSessions,
  useSessionRecords,
  useCreateSession,
  useSaveRecords,
  useDeleteSession,
  useMyAttendance,
} from '@/lib/hooks/useCourses';
import { AttendanceRecord } from '@/lib/types/course';

interface Props {
  courseId: number;
  canEdit: boolean;
}

function statusLabel(s: 'present' | 'late' | 'absent') {
  if (s === 'present') return 'Présent';
  if (s === 'late') return 'En retard';
  return 'Absent';
}

function statusColor(s: 'present' | 'late' | 'absent') {
  if (s === 'present') return 'bg-green-100 text-green-800 border-green-300';
  if (s === 'late') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  return 'bg-red-100 text-red-800 border-red-300';
}

// ─── Teacher Session Panel ────────────────────────────────────────────────────

function SessionRecordsPanel({ courseId, sessionId }: { courseId: number; sessionId: number }) {
  const { data, isLoading } = useSessionRecords(courseId, sessionId);
  const saveRecords = useSaveRecords(courseId);

  const [localStatuses, setLocalStatuses] = useState<Record<number, 'present' | 'late' | 'absent'>>({});

  const records: AttendanceRecord[] = data?.records ?? [];
  const statuses: Record<number, 'present' | 'late' | 'absent'> = {};
  records.forEach(r => { statuses[r.student_id] = localStatuses[r.student_id] ?? r.status; });

  const handleSave = () => {
    const toSave = records.map(r => ({
      student_id: r.student_id,
      status: statuses[r.student_id] ?? r.status,
    }));
    saveRecords.mutate({ sessionId, records: toSave });
  };

  if (isLoading) return <div className="p-4"><Skeleton className="h-20" /></div>;
  if (!records.length) return <p className="p-4 text-sm text-muted-foreground">Aucun étudiant inscrit.</p>;

  return (
    <div className="border-t border-bolt-line p-4 space-y-3">
      <div className="space-y-2">
        {records.map(r => {
          const st = statuses[r.student_id] ?? r.status;
          return (
            <div key={r.student_id} className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{r.student_name ?? r.student_email ?? `Étudiant #${r.student_id}`}</span>
              <div className="flex gap-1">
                {(['present', 'late', 'absent'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setLocalStatuses(prev => ({ ...prev, [r.student_id]: opt }))}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                      st === opt
                        ? statusColor(opt)
                        : 'bg-muted/30 text-muted-foreground border-transparent hover:border-bolt-line'
                    }`}
                  >
                    {statusLabel(opt)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Button size="sm" onClick={handleSave} disabled={saveRecords.isPending}>
        {saveRecords.isPending ? 'Enregistrement...' : 'Enregistrer'}
      </Button>
    </div>
  );
}

// ─── Teacher View ─────────────────────────────────────────────────────────────

function TeacherAttendanceView({ courseId }: { courseId: number }) {
  const { data, isLoading } = useAttendanceSessions(courseId);
  const createSession = useCreateSession(courseId);
  const deleteSession = useDeleteSession(courseId);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const handleCreate = () => {
    if (!title.trim() || !date) return;
    createSession.mutate(
      { title: title.trim(), date },
      {
        onSuccess: () => {
          setTitle('');
          setDate(new Date().toISOString().slice(0, 10));
          setShowForm(false);
        },
      }
    );
  };

  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold">Séances ({sessions.length})</h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4 mr-1" />
          Ajouter une séance
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-bolt-line bg-muted/20 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="session-title">Titre</Label>
              <Input
                id="session-title"
                placeholder="Ex: Cours 01"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="session-date">Date</Label>
              <Input
                id="session-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createSession.isPending}>
              {createSession.isPending ? 'Création...' : 'Créer'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {isLoading && <Skeleton className="h-24" />}

      {!isLoading && sessions.length === 0 && (
        <div className="rounded-xl border border-bolt-line bg-white p-8 text-center">
          <p className="text-sm text-muted-foreground">Aucune séance créée pour le moment.</p>
        </div>
      )}

      {sessions.map(session => (
        <div key={session.id} className="rounded-xl border border-bolt-line bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{session.title}</p>
              <p className="text-xs text-muted-foreground">{session.date}</p>
            </div>
            <div className="flex items-center gap-2">
              {session.present_count !== undefined && (
                <div className="flex gap-1">
                  <span className="px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-800">✓ {session.present_count}</span>
                  <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800">⏰ {session.late_count ?? 0}</span>
                  <span className="px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-800">✗ {session.absent_count ?? 0}</span>
                </div>
              )}
              <button
                onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                className="p-1 hover:text-bolt-accent transition-colors"
              >
                {expandedId === session.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {confirmDeleteId === session.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => { deleteSession.mutate(session.id); setConfirmDeleteId(null); }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Confirmer
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-muted-foreground hover:underline">
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(session.id)}
                  className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          {expandedId === session.id && (
            <SessionRecordsPanel courseId={courseId} sessionId={session.id} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Student View ─────────────────────────────────────────────────────────────

function StudentAttendanceView({ courseId }: { courseId: number }) {
  const { data, isLoading } = useMyAttendance(courseId);

  if (isLoading) return <Skeleton className="h-32" />;

  const summary = data?.summary;
  const attendance = data?.attendance ?? [];

  const total = summary?.total ?? attendance.length;
  const present = summary?.present ?? attendance.filter((a: any) => a.status === 'present').length;
  const late = summary?.late ?? attendance.filter((a: any) => a.status === 'late').length;
  const absent = summary?.absent ?? attendance.filter((a: any) => a.status === 'absent').length;
  const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Présent', value: present, cls: 'text-green-600' },
          { label: 'En retard', value: late, cls: 'text-yellow-600' },
          { label: 'Absent', value: absent, cls: 'text-red-600' },
          { label: 'Taux de présence', value: `${rate}%`, cls: 'text-bolt-accent' },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={`text-2xl font-bold mt-1 ${item.cls}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {attendance.length > 0 && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-4">
          <h3 className="text-sm font-semibold mb-3">Détail par séance</h3>
          <div className="space-y-2">
            {attendance.map((a: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{a.session_title ?? `Séance ${i + 1}`}</span>
                <span className={`px-2 py-0.5 rounded text-xs border ${statusColor(a.status)}`}>
                  {statusLabel(a.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {attendance.length === 0 && (
        <div className="rounded-xl border border-bolt-line bg-white shadow-sm p-8 text-center">
          <p className="text-sm text-muted-foreground">Aucune donnée de présence disponible.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function AttendanceTab({ courseId, canEdit }: Props) {
  return (
    <div className="space-y-4">
      {canEdit ? (
        <TeacherAttendanceView courseId={courseId} />
      ) : (
        <StudentAttendanceView courseId={courseId} />
      )}
    </div>
  );
}

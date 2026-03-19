'use client';

import { useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronUp, BookOpen, FileText, Edit2, X, Check } from 'lucide-react';
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
  useCourseActivities,
  useSaveSessionActivities,
} from '@/lib/hooks/useCourses';
import { AttendanceRecord, AttendanceSession, CourseActivity } from '@/lib/types/course';

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

// ─── Shared Activity Helpers ──────────────────────────────────────────────────

function ActivityIcon({ type }: { type: 'quiz' | 'assignment' }) {
  return type === 'quiz'
    ? <BookOpen className="h-3.5 w-3.5 text-bolt-accent shrink-0" />
    : <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

function ActivityList({ activities }: { activities: CourseActivity[] }) {
  if (!activities.length) return <p className="text-xs text-muted-foreground">Aucune activité couverte.</p>;

  const byChapter: Record<string, CourseActivity[]> = {};
  activities.forEach(a => {
    const key = a.chapter_title ?? 'Sans chapitre';
    if (!byChapter[key]) byChapter[key] = [];
    byChapter[key].push(a);
  });

  return (
    <div className="space-y-3">
      {Object.entries(byChapter).map(([chapter, acts]) => (
        <div key={chapter}>
          <p className="text-xs font-semibold text-muted-foreground mb-1">{chapter}</p>
          <div className="space-y-1">
            {acts.map(a => (
              <div key={`${a.type}-${a.id}`} className="flex items-start gap-2">
                <ActivityIcon type={a.type} />
                <div>
                  <p className="text-xs font-medium leading-tight">{a.title}</p>
                  {a.section_title && <p className="text-[10px] text-muted-foreground">{a.section_title}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityPicker({
  courseId,
  selected,
  onChange,
}: {
  courseId: number;
  selected: CourseActivity[];
  onChange: (activities: CourseActivity[]) => void;
}) {
  const { data, isLoading } = useCourseActivities(courseId);
  const activities: CourseActivity[] = data?.activities ?? [];
  const isSelected = (a: CourseActivity) => selected.some(s => s.type === a.type && s.id === a.id);

  const toggle = (a: CourseActivity) => {
    if (isSelected(a)) {
      onChange(selected.filter(s => !(s.type === a.type && s.id === a.id)));
    } else {
      onChange([...selected, a]);
    }
  };

  if (isLoading) return <Skeleton className="h-16" />;
  if (!activities.length) return <p className="text-xs text-muted-foreground">Aucune activité disponible.</p>;

  const byChapter: Record<string, CourseActivity[]> = {};
  activities.forEach(a => {
    const key = a.chapter_title ?? 'Sans chapitre';
    if (!byChapter[key]) byChapter[key] = [];
    byChapter[key].push(a);
  });

  return (
    <div className="space-y-3 max-h-60 overflow-y-auto">
      {Object.entries(byChapter).map(([chapter, acts]) => (
        <div key={chapter}>
          <p className="text-xs font-semibold text-muted-foreground mb-1">{chapter}</p>
          <div className="space-y-1">
            {acts.map(a => (
              <label key={`${a.type}-${a.id}`} className="flex items-start gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isSelected(a)}
                  onChange={() => toggle(a)}
                  className="mt-0.5 accent-bolt-accent"
                />
                <div className="flex items-start gap-1.5">
                  <ActivityIcon type={a.type} />
                  <div>
                    <p className="text-xs font-medium leading-tight group-hover:text-bolt-accent transition-colors">{a.title}</p>
                    {a.section_title && <p className="text-[10px] text-muted-foreground">{a.section_title}</p>}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Session Detail Panel (Teacher) ──────────────────────────────────────────

function SessionDetailPanel({
  courseId,
  session,
  canEdit,
}: {
  courseId: number;
  session: AttendanceSession;
  canEdit: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'presence' | 'activities'>('presence');
  const { data, isLoading } = useSessionRecords(courseId, session.id);
  const saveRecords = useSaveRecords(courseId);
  const saveActivities = useSaveSessionActivities(courseId);
  const [localStatuses, setLocalStatuses] = useState<Record<number, 'present' | 'late' | 'absent'>>({});
  const [editingActivities, setEditingActivities] = useState(false);
  const [draftActivities, setDraftActivities] = useState<CourseActivity[]>([]);

  const records: AttendanceRecord[] = data?.records ?? [];
  const statuses: Record<number, 'present' | 'late' | 'absent'> = {};
  records.forEach(r => { statuses[r.student_id] = localStatuses[r.student_id] ?? r.status; });

  const currentActivities: CourseActivity[] = session.activities_covered ?? [];

  const handleSaveRecords = () => {
    const toSave = records.map(r => ({
      student_id: r.student_id,
      status: statuses[r.student_id] ?? r.status,
    }));
    saveRecords.mutate({ sessionId: session.id, records: toSave });
  };

  const handleEditActivities = () => {
    setDraftActivities([...currentActivities]);
    setEditingActivities(true);
  };

  const handleSaveActivities = () => {
    saveActivities.mutate(
      { sessionId: session.id, activities: draftActivities },
      { onSuccess: () => setEditingActivities(false) }
    );
  };

  return (
    <div className="border-t border-bolt-line">
      <div className="flex border-b border-bolt-line">
        {(['presence', 'activities'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-bolt-accent text-bolt-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'presence' ? 'Présence' : 'Activités'}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === 'presence' && (
          isLoading ? <Skeleton className="h-20" /> :
          !records.length ? <p className="text-sm text-muted-foreground">Aucun étudiant inscrit.</p> : (
            <div className="space-y-3">
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
              <Button size="sm" onClick={handleSaveRecords} disabled={saveRecords.isPending}>
                {saveRecords.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          )
        )}

        {activeTab === 'activities' && (
          <div className="space-y-3">
            {editingActivities ? (
              <>
                <ActivityPicker courseId={courseId} selected={draftActivities} onChange={setDraftActivities} />
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveActivities} disabled={saveActivities.isPending}>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    {saveActivities.isPending ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingActivities(false)}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    Annuler
                  </Button>
                </div>
              </>
            ) : (
              <>
                <ActivityList activities={currentActivities} />
                {canEdit && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={handleEditActivities}>
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    Modifier
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
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
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [selectedActivities, setSelectedActivities] = useState<CourseActivity[]>([]);

  const handleCreate = () => {
    if (!title.trim() || !date) return;
    createSession.mutate(
      { title: title.trim(), date, activities_covered: selectedActivities },
      {
        onSuccess: () => {
          setTitle('');
          setDate(new Date().toISOString().slice(0, 10));
          setShowForm(false);
          setSelectedActivities([]);
          setShowActivityPicker(false);
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

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowActivityPicker(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showActivityPicker ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Activités couvertes
              {selectedActivities.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-bolt-accent/10 text-bolt-accent text-[10px] font-medium">
                  {selectedActivities.length}
                </span>
              )}
            </button>
            {showActivityPicker && (
              <div className="rounded-lg border border-bolt-line bg-white p-3">
                <ActivityPicker courseId={courseId} selected={selectedActivities} onChange={setSelectedActivities} />
              </div>
            )}
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
            <SessionDetailPanel courseId={courseId} session={session} canEdit={true} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Student View ─────────────────────────────────────────────────────────────

type MyAttendanceEntry = {
  session_title?: string;
  status: 'present' | 'late' | 'absent';
  activities_covered?: CourseActivity[];
};

function StudentAttendanceView({ courseId }: { courseId: number }) {
  const { data, isLoading } = useMyAttendance(courseId);

  if (isLoading) return <Skeleton className="h-32" />;

  const summary = data?.summary;
  const attendance: MyAttendanceEntry[] = data?.attendance ?? [];

  const total = summary?.total ?? attendance.length;
  const present = summary?.present ?? attendance.filter(a => a.status === 'present').length;
  const late = summary?.late ?? attendance.filter(a => a.status === 'late').length;
  const absent = summary?.absent ?? attendance.filter(a => a.status === 'absent').length;
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
          <div className="space-y-3">
            {attendance.map((a, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span>{a.session_title ?? `Séance ${i + 1}`}</span>
                  <span className={`px-2 py-0.5 rounded text-xs border ${statusColor(a.status)}`}>
                    {statusLabel(a.status)}
                  </span>
                </div>
                {a.activities_covered && a.activities_covered.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-1">
                    {a.activities_covered.map(act => (
                      <span
                        key={`${act.type}-${act.id}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-bolt-line bg-muted/30 text-[10px] text-muted-foreground"
                      >
                        <ActivityIcon type={act.type} />
                        {act.title}
                      </span>
                    ))}
                  </div>
                )}
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

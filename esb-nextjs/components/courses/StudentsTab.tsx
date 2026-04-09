'use client';

import { useState, useMemo } from 'react';
import { Search, UserPlus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useCourseStudents,
  useAvailableStudents,
  useEnrollStudents,
  useRemoveStudent,
} from '@/lib/hooks/useCourses';

interface Props {
  courseId: number;
}

export function StudentsTab({ courseId }: Props) {
  const { data, isLoading } = useCourseStudents(courseId);
  const removeMutation = useRemoveStudent(courseId);

  const [search, setSearch] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: number; username: string } | null>(null);

  const filteredStudents = useMemo(() => {
    if (!data?.students) return [];
    if (!search.trim()) return data.students;
    const q = search.toLowerCase();
    return data.students.filter(
      (s) =>
        s.username.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.class_name && s.class_name.toLowerCase().includes(q))
    );
  }, [data?.students, search]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Étudiants inscrits</h2>
          <Badge variant="secondary">{data?.total ?? 0}</Badge>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Ajouter des étudiants
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom, email ou classe..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Student table */}
      {filteredStudents.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-bolt-line bg-muted/20 p-8 text-center">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">
            {data?.total === 0 ? 'Aucun étudiant inscrit' : 'Aucun résultat'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total === 0
              ? 'Cliquez sur "Ajouter des étudiants" pour inscrire des étudiants à ce cours.'
              : 'Essayez un autre terme de recherche.'}
          </p>
        </div>
      ) : (
        <div className="rounded-[12px] border border-bolt-line bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">{student.username}</TableCell>
                  <TableCell className="text-muted-foreground">{student.email}</TableCell>
                  <TableCell>
                    {student.class_name ? (
                      <Badge variant="outline">{student.class_name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">–</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setRemoveTarget({ id: student.id, username: student.username })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add students dialog */}
      <AddStudentsDialog
        courseId={courseId}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />

      {/* Remove confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer l&apos;étudiant</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir retirer <strong>{removeTarget?.username}</strong> de ce cours ?
              Cette action est réversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (removeTarget) {
                  removeMutation.mutate(removeTarget.id);
                  setRemoveTarget(null);
                }
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Add Students Dialog ─────────────────────────────────────────────────────

function AddStudentsDialog({
  courseId,
  open,
  onOpenChange,
}: {
  courseId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { data, isLoading } = useAvailableStudents(courseId, search);
  const enrollMutation = useEnrollStudents(courseId);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    if (selected.size === 0) return;
    enrollMutation.mutate(Array.from(selected), {
      onSuccess: () => {
        setSelected(new Set());
        setSearch('');
        onOpenChange(false);
      },
    });
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setSelected(new Set());
      setSearch('');
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Ajouter des étudiants</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 border rounded-lg">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !data?.students || data.students.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucun étudiant disponible.
            </div>
          ) : (
            <div className="divide-y">
              {data.students.map((student) => (
                <label
                  key={student.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(student.id)}
                    onCheckedChange={() => toggle(student.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{student.username}</p>
                    <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                  </div>
                  {student.class_name && (
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {student.class_name}
                    </Badge>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-muted-foreground">
              {selected.size} sélectionné(s)
            </span>
            <Button
              onClick={handleSubmit}
              disabled={selected.size === 0 || enrollMutation.isPending}
            >
              {enrollMutation.isPending ? 'Ajout en cours...' : 'Ajouter'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

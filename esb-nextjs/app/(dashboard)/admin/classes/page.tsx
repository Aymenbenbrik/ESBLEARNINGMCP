'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  useAdminClasses,
  useAdminCreateClass,
  useAdminUpdateClass,
  useAdminDeleteClass,
} from '@/lib/hooks/useAdmin';
import { usePrograms } from '@/lib/hooks/usePrograms';
import { AdminClassListItem, AdminCreateClassData, AdminUpdateClassData } from '@/lib/types/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  BookOpen,
  Edit,
  Eye,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
  GraduationCap,
} from 'lucide-react';

export default function AdminClassesPage() {
  // ─── State ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<AdminClassListItem | null>(null);
  const [deletingClass, setDeletingClass] = useState<AdminClassListItem | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAcademicYear, setFormAcademicYear] = useState('');
  const [formProgramId, setFormProgramId] = useState<string>('none');

  // ─── Hooks ──────────────────────────────────────────────────────────
  const { data, isLoading, error } = useAdminClasses();
  const { data: programsData } = usePrograms();
  const createMutation = useAdminCreateClass();
  const updateMutation = useAdminUpdateClass();
  const deleteMutation = useAdminDeleteClass();

  // ─── Filtered data ─────────────────────────────────────────────────
  const filteredClasses = useMemo(() => {
    if (!data?.classes) return [];
    if (!search.trim()) return data.classes;
    const q = search.toLowerCase();
    return data.classes.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.program_name && c.program_name.toLowerCase().includes(q)) ||
        (c.academic_year && c.academic_year.toLowerCase().includes(q))
    );
  }, [data?.classes, search]);

  // ─── Handlers ───────────────────────────────────────────────────────
  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormAcademicYear('');
    setFormProgramId('none');
    setEditingClass(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (cls: AdminClassListItem) => {
    setEditingClass(cls);
    setFormName(cls.name);
    setFormDescription(cls.description || '');
    setFormAcademicYear(cls.academic_year || '');
    setFormProgramId(cls.program_id ? String(cls.program_id) : 'none');
    setDialogOpen(true);
  };

  const openDeleteDialog = (cls: AdminClassListItem) => {
    setDeletingClass(cls);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formName.trim()) return;

    const programId = formProgramId !== 'none' ? parseInt(formProgramId) : null;

    if (editingClass) {
      const updateData: AdminUpdateClassData = {
        name: formName.trim(),
        description: formDescription.trim(),
        academic_year: formAcademicYear.trim(),
        program_id: programId,
      };
      updateMutation.mutate(
        { classId: editingClass.id, data: updateData },
        {
          onSuccess: () => {
            setDialogOpen(false);
            resetForm();
          },
        }
      );
    } else {
      const createData: AdminCreateClassData = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        academic_year: formAcademicYear.trim() || undefined,
        program_id: programId,
      };
      createMutation.mutate(createData, {
        onSuccess: () => {
          setDialogOpen(false);
          resetForm();
        },
      });
    }
  };

  const handleDelete = () => {
    if (!deletingClass) return;
    deleteMutation.mutate(deletingClass.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setDeletingClass(null);
      },
    });
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  // ─── Render ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as any)?.response?.data?.error || 'Failed to load classes'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            Gestion des Classes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Créer, modifier et gérer les classes académiques
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle classe
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Rechercher par nom, programme ou année..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Classes Table */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>
            Toutes les classes {data ? `(${data.total})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <GraduationCap className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">
                {search ? 'Aucun résultat' : 'Aucune classe'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {search
                  ? 'Essayez de modifier votre recherche'
                  : 'Créez votre première classe pour commencer'}
              </p>
              {!search && (
                <Button onClick={openCreateDialog} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Créer une classe
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Nom</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Programme</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Année</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Étudiants</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Cours</th>
                    <th className="text-right py-2 px-3 text-sm text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.map((cls) => (
                    <tr key={cls.id} className="border-b last:border-b-0 hover:bg-slate-50">
                      <td className="py-2 px-3">
                        <Link
                          href={`/admin/classes/${cls.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {cls.name}
                        </Link>
                        {cls.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {cls.description}
                          </p>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {cls.program_name ? (
                          <Badge variant="secondary" className="text-xs">
                            {cls.program_name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-sm">
                        {cls.academic_year || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1 text-sm">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {cls.students_count}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1 text-sm">
                          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          {cls.courses_count}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild title="Voir les détails">
                            <Link href={`/admin/classes/${cls.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(cls)}
                            title="Modifier"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(cls)}
                            title="Supprimer"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingClass ? 'Modifier la classe' : 'Nouvelle classe'}
            </DialogTitle>
            <DialogDescription>
              {editingClass
                ? 'Modifiez les informations de la classe.'
                : 'Remplissez les informations pour créer une nouvelle classe.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="class-name">Nom *</Label>
              <Input
                id="class-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: 3A-INFO-01"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-description">Description</Label>
              <Input
                id="class-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Description optionnelle"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-year">Année académique</Label>
              <Input
                id="class-year"
                value={formAcademicYear}
                onChange={(e) => setFormAcademicYear(e.target.value)}
                placeholder="Ex: 2025-2026"
              />
            </div>

            <div className="space-y-2">
              <Label>Programme</Label>
              <Select value={formProgramId} onValueChange={setFormProgramId}>
                <SelectTrigger>
                  <SelectValue placeholder="Aucun programme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun programme</SelectItem>
                  {programsData?.programs?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={!formName.trim() || isMutating}>
              {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingClass ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer la classe</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer la classe{' '}
              <strong>{deletingClass?.name}</strong> ?
              {deletingClass && deletingClass.students_count > 0 && (
                <span className="block mt-2 text-destructive">
                  ⚠️ {deletingClass.students_count} étudiant(s) seront désaffectés de cette classe.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

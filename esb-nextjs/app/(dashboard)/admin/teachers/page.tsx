'use client';

import { useState, useMemo } from 'react';
import {
  useAdminTeachers,
  useAdminCreateTeacher,
  useAdminUpdateTeacher,
  useAdminDeleteTeacher,
  useAdminResetTeacherPassword,
} from '@/lib/hooks/useAdmin';
import { AdminTeacher, CreateTeacherData, UpdateTeacherData } from '@/lib/types/admin';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  BookOpen,
  Check,
  Copy,
  GraduationCap,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminTeachersPage() {
  // ─── State ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [resetPwdDialogOpen, setResetPwdDialogOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<AdminTeacher | null>(null);
  const [deletingTeacher, setDeletingTeacher] = useState<AdminTeacher | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');

  // Credentials display state
  const [createdUsername, setCreatedUsername] = useState('');
  const [createdPassword, setCreatedPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetTeacherName, setResetTeacherName] = useState('');

  // ─── Hooks ──────────────────────────────────────────────────────────
  const { data, isLoading, error } = useAdminTeachers();
  const createMutation = useAdminCreateTeacher();
  const updateMutation = useAdminUpdateTeacher();
  const deleteMutation = useAdminDeleteTeacher();
  const resetPwdMutation = useAdminResetTeacherPassword();

  // ─── Filtered data ─────────────────────────────────────────────────
  const filteredTeachers = useMemo(() => {
    if (!data?.teachers) return [];
    if (!search.trim()) return data.teachers;
    const q = search.toLowerCase();
    return data.teachers.filter(
      (t) =>
        t.username.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q)
    );
  }, [data?.teachers, search]);

  // ─── Handlers ───────────────────────────────────────────────────────
  const resetForm = () => {
    setFormUsername('');
    setFormEmail('');
    setFormPassword('');
    setEditingTeacher(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (teacher: AdminTeacher) => {
    setEditingTeacher(teacher);
    setFormUsername(teacher.username);
    setFormEmail(teacher.email);
    setFormPassword('');
    setDialogOpen(true);
  };

  const openDeleteDialog = (teacher: AdminTeacher) => {
    setDeletingTeacher(teacher);
    setDeleteDialogOpen(true);
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Copié dans le presse-papier');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSubmit = () => {
    if (editingTeacher) {
      const updateData: UpdateTeacherData = {};
      if (formUsername.trim() && formUsername.trim() !== editingTeacher.username) {
        updateData.username = formUsername.trim();
      }
      if (formEmail.trim() && formEmail.trim() !== editingTeacher.email) {
        updateData.email = formEmail.trim();
      }
      updateMutation.mutate(
        { teacherId: editingTeacher.id, data: updateData },
        {
          onSuccess: () => {
            setDialogOpen(false);
            resetForm();
          },
        }
      );
    } else {
      if (!formUsername.trim() || !formEmail.trim()) return;
      const createData: CreateTeacherData = {
        username: formUsername.trim(),
        email: formEmail.trim(),
        password: formPassword.trim() || undefined,
      };
      createMutation.mutate(createData, {
        onSuccess: (result) => {
          setDialogOpen(false);
          resetForm();
          setCreatedUsername(result.teacher.username);
          setCreatedPassword(result.teacher.password);
          setCredentialsDialogOpen(true);
        },
      });
    }
  };

  const handleDelete = () => {
    if (!deletingTeacher) return;
    deleteMutation.mutate(deletingTeacher.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setDeletingTeacher(null);
      },
    });
  };

  const handleResetPassword = (teacher: AdminTeacher) => {
    resetPwdMutation.mutate(
      { teacherId: teacher.id },
      {
        onSuccess: (result) => {
          setResetPassword(result.password);
          setResetTeacherName(teacher.username);
          setResetPwdDialogOpen(true);
        },
      }
    );
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  // ─── Render ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as any)?.response?.data?.error || 'Erreur lors du chargement des enseignants'}
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
            <Users className="h-6 w-6" />
            Gestion des Enseignants
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Créer, modifier et gérer les comptes enseignants
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Ajouter un enseignant
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Rechercher par nom ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Teachers Table */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>
            Tous les enseignants {data ? `(${data.total})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">
                {search ? 'Aucun résultat' : 'Aucun enseignant'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {search
                  ? 'Essayez de modifier votre recherche'
                  : 'Ajoutez votre premier enseignant pour commencer'}
              </p>
              {!search && (
                <Button onClick={openCreateDialog} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter un enseignant
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Username</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Email</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Cours</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Étudiants</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Date de création</th>
                    <th className="text-right py-2 px-3 text-sm text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeachers.map((teacher) => (
                    <tr key={teacher.id} className="border-b last:border-b-0 hover:bg-slate-50">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{teacher.username}</span>
                          {teacher.is_superuser && (
                            <Badge variant="destructive" className="text-xs">
                              Admin
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-sm">{teacher.email}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1 text-sm">
                          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          <Badge variant="secondary" className="text-xs">
                            {teacher.courses_count}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1 text-sm">
                          <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                          <Badge variant="secondary" className="text-xs">
                            {teacher.students_count}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">
                        {teacher.created_at
                          ? new Date(teacher.created_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(teacher)}
                            title="Modifier"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetPassword(teacher)}
                            disabled={resetPwdMutation.isPending}
                            title="Réinitialiser le mot de passe"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(teacher)}
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
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTeacher ? "Modifier l'enseignant" : 'Ajouter un enseignant'}
            </DialogTitle>
            <DialogDescription>
              {editingTeacher
                ? "Modifiez les informations de l'enseignant."
                : 'Remplissez les informations pour créer un nouveau compte enseignant.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="teacher-username">Nom d&apos;utilisateur *</Label>
              <Input
                id="teacher-username"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="Ex: prof.dupont"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="teacher-email">Email *</Label>
              <Input
                id="teacher-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="Ex: dupont@esprit.tn"
              />
            </div>

            {!editingTeacher && (
              <div className="space-y-2">
                <Label htmlFor="teacher-password">Mot de passe (optionnel)</Label>
                <Input
                  id="teacher-password"
                  type="text"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Laissez vide pour générer automatiquement"
                />
                <p className="text-xs text-muted-foreground">
                  Si non renseigné, un mot de passe sera généré automatiquement.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                (!editingTeacher && (!formUsername.trim() || !formEmail.trim())) || isMutating
              }
            >
              {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingTeacher ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog (after creation) */}
      <Dialog open={credentialsDialogOpen} onOpenChange={setCredentialsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <Check className="h-5 w-5" />
              Enseignant créé avec succès
            </DialogTitle>
            <DialogDescription>
              Voici les identifiants de connexion. Conservez-les précieusement, le mot de passe ne
              pourra plus être affiché.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground">Nom d&apos;utilisateur</p>
                <p className="font-mono font-medium">{createdUsername}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(createdUsername, 'username')}
              >
                {copiedField === 'username' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground">Mot de passe</p>
                <p className="font-mono font-medium text-red-600">{createdPassword}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(createdPassword, 'password')}
              >
                {copiedField === 'password' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                handleCopy(`Utilisateur: ${createdUsername}\nMot de passe: ${createdPassword}`, 'all')
              }
            >
              <Copy className="h-4 w-4 mr-2" />
              Tout copier
            </Button>
            <Button onClick={() => setCredentialsDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l&apos;enseignant</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer l&apos;enseignant{' '}
              <strong>{deletingTeacher?.username}</strong> ?
              {deletingTeacher && deletingTeacher.courses_count > 0 && (
                <span className="block mt-2 text-destructive">
                  ⚠️ Cet enseignant est assigné à {deletingTeacher.courses_count} cours. La
                  suppression sera bloquée tant qu&apos;il a des cours assignés.
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

      {/* Reset Password Dialog */}
      <Dialog open={resetPwdDialogOpen} onOpenChange={setResetPwdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Mot de passe réinitialisé
            </DialogTitle>
            <DialogDescription>
              Le mot de passe de <strong>{resetTeacherName}</strong> a été réinitialisé.
              Conservez-le précieusement.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground">Nouveau mot de passe</p>
                <p className="font-mono font-medium text-red-600">{resetPassword}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(resetPassword, 'resetPwd')}
              >
                {copiedField === 'resetPwd' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setResetPwdDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

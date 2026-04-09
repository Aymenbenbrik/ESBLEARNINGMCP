'use client';

import { useState } from 'react';
import {
  useAllStudents,
  useGenerateStudents,
  useResetStudentPassword,
  useExportStudentsCsv,
  useAdminUpdateStudent,
} from '@/lib/hooks/useStudents';
import { GeneratedStudent, StudentListItem } from '@/lib/api/students';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ClipboardCopy,
  Download,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminStudentsPage() {
  // ─── State ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [genCount, setGenCount] = useState(10);
  const [genPrefix, setGenPrefix] = useState('etudiant');
  const [genDomain, setGenDomain] = useState('esprit.tn');
  const [genClassId, setGenClassId] = useState<string>('none');
  const [generatedStudents, setGeneratedStudents] = useState<GeneratedStudent[]>([]);
  const [showGenForm, setShowGenForm] = useState(false);

  // Edit dialog state
  const [editStudent, setEditStudent] = useState<StudentListItem | null>(null);
  const [editClassId, setEditClassId] = useState<string>('none');

  // Password reset dialog state
  const [resetPwdResult, setResetPwdResult] = useState<{ username: string; password: string } | null>(null);

  // ─── Hooks ──────────────────────────────────────────────────────────
  const classIdParam = classFilter !== 'all' ? parseInt(classFilter) : undefined;
  const { data, isLoading } = useAllStudents({
    class_id: classIdParam,
    search: search || undefined,
  });
  const generateMutation = useGenerateStudents();
  const resetPwdMutation = useResetStudentPassword();
  const exportMutation = useExportStudentsCsv();
  const adminUpdateMutation = useAdminUpdateStudent();

  // ─── Handlers ───────────────────────────────────────────────────────
  const handleGenerate = () => {
    generateMutation.mutate(
      {
        count: genCount,
        class_id: genClassId !== 'none' ? parseInt(genClassId) : undefined,
        username_prefix: genPrefix,
        email_domain: genDomain,
      },
      {
        onSuccess: (result) => {
          setGeneratedStudents(result.students);
        },
      },
    );
  };

  const handleCopyAll = () => {
    const text = generatedStudents
      .map((s) => `${s.username}\t${s.email}\t${s.password}`)
      .join('\n');
    navigator.clipboard.writeText(`Username\tEmail\tPassword\n${text}`);
    toast.success('Credentials copiés dans le presse-papier');
  };

  const handleExport = () => {
    exportMutation.mutate(classIdParam);
  };

  const handleResetPassword = (student: StudentListItem) => {
    resetPwdMutation.mutate(student.id, {
      onSuccess: (result) => {
        setResetPwdResult({ username: student.username, password: result.new_password });
      },
    });
  };

  const handleEditOpen = (student: StudentListItem) => {
    setEditStudent(student);
    setEditClassId(student.class_id ? String(student.class_id) : 'none');
  };

  const handleEditSave = () => {
    if (!editStudent) return;
    const newClassId = editClassId === 'none' ? null : parseInt(editClassId);
    adminUpdateMutation.mutate(
      { studentId: editStudent.id, data: { class_id: newClassId } },
      { onSuccess: () => setEditStudent(null) },
    );
  };

  const handleToggleActive = (student: StudentListItem) => {
    adminUpdateMutation.mutate({
      studentId: student.id,
      data: { is_active: !student.is_active },
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gestion des Étudiants
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Générer, gérer et exporter les comptes étudiants
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exportMutation.isPending}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={() => setShowGenForm(!showGenForm)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Générer des étudiants
          </Button>
        </div>
      </div>

      {/* ─── Generation Form ─── */}
      {showGenForm && (
        <Card className="rounded-2xl border-red-200 bg-red-50/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5 text-red-600" />
              Générer des comptes étudiants
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Nombre d&apos;étudiants</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={genCount}
                  onChange={(e) => setGenCount(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label>Préfixe username</Label>
                <Input
                  value={genPrefix}
                  onChange={(e) => setGenPrefix(e.target.value)}
                  placeholder="etudiant"
                />
              </div>
              <div className="space-y-2">
                <Label>Domaine email</Label>
                <Input
                  value={genDomain}
                  onChange={(e) => setGenDomain(e.target.value)}
                  placeholder="esprit.tn"
                />
              </div>
              <div className="space-y-2">
                <Label>Classe (optionnel)</Label>
                <Select value={genClassId} onValueChange={setGenClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Aucune" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {data?.classes?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Générer {genCount} étudiant(s)
              </Button>
            </div>

            {/* Generated credentials table */}
            {generatedStudents.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-green-700">
                    ✅ {generatedStudents.length} compte(s) créé(s)
                  </h3>
                  <Button variant="outline" size="sm" onClick={handleCopyAll}>
                    <ClipboardCopy className="h-4 w-4 mr-2" />
                    Copier tous les credentials
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-green-200">
                  <table className="w-full text-sm">
                    <thead className="bg-green-50">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium">Username</th>
                        <th className="text-left py-2 px-3 font-medium">Email</th>
                        <th className="text-left py-2 px-3 font-medium">Mot de passe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generatedStudents.map((s) => (
                        <tr key={s.id} className="border-t border-green-100">
                          <td className="py-2 px-3 font-mono">{s.username}</td>
                          <td className="py-2 px-3">{s.email}</td>
                          <td className="py-2 px-3 font-mono text-red-600">{s.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Filters ─── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Toutes les classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les classes</SelectItem>
            {data?.classes?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── Students Table ─── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>
            Liste des étudiants {data ? `(${data.total})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !data || data.students.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun étudiant trouvé.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Username</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Email</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Classe</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Statut</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Créé le</th>
                    <th className="text-left py-2 px-3 text-sm text-muted-foreground">Dernière connexion</th>
                    <th className="text-right py-2 px-3 text-sm text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.id} className={`border-b last:border-b-0 hover:bg-slate-50 ${!s.is_active ? 'opacity-50' : ''}`}>
                      <td className="py-2 px-3 font-medium">{s.username}</td>
                      <td className="py-2 px-3 text-sm">{s.email}</td>
                      <td className="py-2 px-3">
                        {s.class_name ? (
                          <Badge variant="secondary" className="text-xs">
                            {s.class_name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Non affecté</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {!s.is_active ? (
                          <Badge variant="outline" className="text-xs border-red-300 text-red-600">
                            Inactif
                          </Badge>
                        ) : s.is_first_login ? (
                          <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">
                            En attente
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-green-300 text-green-600">
                            Actif
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">
                        {s.created_at ? new Date(s.created_at).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">
                        {s.last_login ? new Date(s.last_login).toLocaleDateString('fr-FR') : 'Jamais'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditOpen(s)}
                            title="Modifier (classe)"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetPassword(s)}
                            disabled={resetPwdMutation.isPending}
                            title="Réinitialiser le mot de passe"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(s)}
                            disabled={adminUpdateMutation.isPending}
                            title={s.is_active ? 'Désactiver' : 'Activer'}
                          >
                            {s.is_active ? (
                              <ShieldOff className="h-4 w-4 text-red-500" />
                            ) : (
                              <ShieldCheck className="h-4 w-4 text-green-500" />
                            )}
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

      {/* ─── Edit Student Dialog (assign class) ─── */}
      <Dialog open={!!editStudent} onOpenChange={(open) => !open && setEditStudent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l&apos;étudiant</DialogTitle>
            <DialogDescription>
              {editStudent?.username} — {editStudent?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Affecter à une classe</Label>
              <Select value={editClassId} onValueChange={setEditClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Aucune classe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune classe</SelectItem>
                  {data?.classes?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} {c.program_name ? `(${c.program_name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStudent(null)}>Annuler</Button>
            <Button onClick={handleEditSave} disabled={adminUpdateMutation.isPending}>
              {adminUpdateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Password Reset Result Dialog ─── */}
      <Dialog open={!!resetPwdResult} onOpenChange={(open) => !open && setResetPwdResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mot de passe réinitialisé</DialogTitle>
            <DialogDescription>
              Nouveau mot de passe pour {resetPwdResult?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-slate-50 border p-4 text-center">
            <p className="text-2xl font-mono font-bold text-red-600 select-all">
              {resetPwdResult?.password}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (resetPwdResult) {
                  navigator.clipboard.writeText(resetPwdResult.password);
                  toast.success('Mot de passe copié');
                }
              }}
            >
              <ClipboardCopy className="h-4 w-4 mr-2" />
              Copier
            </Button>
            <Button onClick={() => setResetPwdResult(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  useProgram,
  useUpdateProgram,
  useAddCourseToProgram,
  useRemoveCourseFromProgram,
  useCreateClass,
  useUploadDescriptor,
  useExtractDescriptor,
  useProcessDescriptor,
  useUploadStudyPlan,
  useExtractSyllabi,
  useDeleteProgram,
  useAAPs,
  useCreateAAP,
  useUpdateAAP,
  useDeleteAAP,
  useCompetences,
  useCreateCompetence,
  useUpdateCompetence,
  useDeleteCompetence,
  useMatrix,
  useUpdateMatrix,
} from '@/lib/hooks/usePrograms';
import { useCourses } from '@/lib/hooks/useCourses';
import { AddCourseForm } from '@/components/admin/AddCourseForm';
import { ProgramCoursesList } from '@/components/admin/ProgramCoursesList';
import { ProgramClassesList } from '@/components/admin/ProgramClassesList';
import { CreateClassForm } from '@/components/admin/CreateClassForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  GraduationCap,
  BarChart3,
  Upload,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Grid3X3,
  Info,
  Zap,
  Users,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import Link from 'next/link';
import {
  CreateClassData,
  ProgramAAP,
  ProgramCompetence,
  ProcessDescriptorResult,
  PipelineModule,
  PipelineTeacher,
} from '@/lib/types/admin';
import { useAAPEvaluation, useCalculateAAPScores } from '@/lib/hooks/useEvaluation';
import { AAPHeatmap } from '@/components/evaluation/AAPHeatmap';
import { RefreshCw, Target } from 'lucide-react';

// ---------------------------------------------------------------------------
// AAP Tab
// ---------------------------------------------------------------------------
function AAPTab({ programId }: { programId: number }) {
  const { data: aaps, isLoading } = useAAPs(programId);
  const createAAP = useCreateAAP();
  const updateAAP = useUpdateAAP();
  const deleteAAP = useDeleteAAP();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAAP, setEditingAAP] = useState<ProgramAAP | null>(null);
  const [form, setForm] = useState({ code: '', description: '', order: 0 });

  const openCreate = () => {
    setEditingAAP(null);
    setForm({ code: '', description: '', order: (aaps?.length ?? 0) + 1 });
    setDialogOpen(true);
  };

  const openEdit = (aap: ProgramAAP) => {
    setEditingAAP(aap);
    setForm({ code: aap.code, description: aap.description, order: aap.order });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingAAP) {
      updateAAP.mutate(
        { programId, aapId: editingAAP.id, data: form },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createAAP.mutate(
        { programId, data: form },
        { onSuccess: () => setDialogOpen(false) }
      );
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Acquis d&apos;Apprentissage Programme (AAP)</CardTitle>
          <CardDescription>Gérer les AAP de ce programme</CardDescription>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !aaps?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Aucun AAP. Ajoutez-en un ou utilisez l&apos;extraction de descripteur.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aaps.map((aap) => (
                <TableRow key={aap.id}>
                  <TableCell>{aap.order}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{aap.code}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal max-w-md">{aap.description}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(aap)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteAAP.mutate({ programId, aapId: aap.id })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAAP ? 'Modifier AAP' : 'Ajouter AAP'}</DialogTitle>
            <DialogDescription>
              {editingAAP
                ? "Modifiez les informations de l'AAP."
                : 'Remplissez les champs pour créer un nouvel AAP.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Code</label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="ex: AAP1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description de l'AAP"
                className="resize-none min-h-[80px]"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Ordre</label>
              <Input
                type="number"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createAAP.isPending || updateAAP.isPending}
            >
              {createAAP.isPending || updateAAP.isPending
                ? 'Enregistrement...'
                : editingAAP
                  ? 'Modifier'
                  : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Competences Tab
// ---------------------------------------------------------------------------
function CompetencesTab({ programId }: { programId: number }) {
  const { data: competences, isLoading } = useCompetences(programId);
  const createComp = useCreateCompetence();
  const updateComp = useUpdateCompetence();
  const deleteComp = useDeleteCompetence();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<ProgramCompetence | null>(null);
  const [form, setForm] = useState({ code: '', description: '' });

  const openCreate = () => {
    setEditingComp(null);
    setForm({ code: '', description: '' });
    setDialogOpen(true);
  };

  const openEdit = (comp: ProgramCompetence) => {
    setEditingComp(comp);
    setForm({ code: comp.code, description: comp.description });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingComp) {
      updateComp.mutate(
        { programId, compId: editingComp.id, data: form },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createComp.mutate(
        { programId, data: form },
        { onSuccess: () => setDialogOpen(false) }
      );
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Compétences</CardTitle>
          <CardDescription>Gérer les compétences de ce programme</CardDescription>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !competences?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Aucune compétence. Ajoutez-en une ou utilisez l&apos;extraction de descripteur.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {competences.map((comp) => (
                <TableRow key={comp.id}>
                  <TableCell>
                    <Badge variant="outline">{comp.code}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal max-w-md">{comp.description}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(comp)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteComp.mutate({ programId, compId: comp.id })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingComp ? 'Modifier Compétence' : 'Ajouter Compétence'}
            </DialogTitle>
            <DialogDescription>
              {editingComp
                ? 'Modifiez les informations de la compétence.'
                : 'Remplissez les champs pour créer une nouvelle compétence.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Code</label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="ex: C1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description de la compétence"
                className="resize-none min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createComp.isPending || updateComp.isPending}
            >
              {createComp.isPending || updateComp.isPending
                ? 'Enregistrement...'
                : editingComp
                  ? 'Modifier'
                  : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Matrix Tab
// ---------------------------------------------------------------------------
function MatrixTab({ programId }: { programId: number }) {
  const { data: matrixData, isLoading } = useMatrix(programId);
  const updateMatrix = useUpdateMatrix();

  const handleToggle = useCallback(
    (competenceId: number, aapId: number, currentlyLinked: boolean) => {
      if (!matrixData) return;

      const newLinks = matrixData.matrix.map((row) => {
        const currentAapIds = row.aap_links
          .map((linked, idx) => (linked ? matrixData.aaps[idx]?.id : null))
          .filter((id): id is number => id !== null);

        if (row.competence.id === competenceId) {
          return {
            competence_id: competenceId,
            aap_ids: currentlyLinked
              ? currentAapIds.filter((id) => id !== aapId)
              : [...currentAapIds, aapId],
          };
        }
        return { competence_id: row.competence.id, aap_ids: currentAapIds };
      });

      updateMatrix.mutate({ programId, links: newLinks });
    },
    [matrixData, programId, updateMatrix]
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!matrixData?.aaps.length || !matrixData?.competences.length) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground text-center">
            Ajoutez des AAP et des compétences pour afficher la matrice.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Grid3X3 className="h-5 w-5" />
          Matrice AAP ↔ Compétences
        </CardTitle>
        <CardDescription>
          Cochez les cases pour lier les compétences aux AAP
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 min-w-[120px]">
                  Compétence
                </TableHead>
                {matrixData.aaps.map((aap) => (
                  <TableHead key={aap.id} className="text-center min-w-[80px]">
                    <span className="text-xs">{aap.code}</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrixData.matrix.map((row) => (
                <TableRow key={row.competence.id}>
                  <TableCell className="sticky left-0 bg-background z-10 font-medium">
                    <Badge variant="outline">{row.competence.code}</Badge>
                  </TableCell>
                  {row.aap_links.map((linked, idx) => {
                    const aap = matrixData.aaps[idx];
                    if (!aap) return null;
                    return (
                      <TableCell key={aap.id} className="text-center">
                        <Checkbox
                          checked={linked}
                          onCheckedChange={() =>
                            handleToggle(row.competence.id, aap.id, linked)
                          }
                          disabled={updateMatrix.isPending}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AAP Evaluation Tab
// ---------------------------------------------------------------------------
function AAPEvaluationTab({ programId }: { programId: number }) {
  const { data: aapEvalData, isLoading } = useAAPEvaluation(programId);
  const calculateMutation = useCalculateAAPScores(programId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5" />
            Évaluation par AAP
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Visualisez les scores de chaque étudiant par Acquis d&apos;Apprentissage de Programme.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full gap-2"
          onClick={() => calculateMutation.mutate()}
          disabled={calculateMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 ${calculateMutation.isPending ? 'animate-spin' : ''}`} />
          Recalculer les scores AAP
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-[350px]" />
      ) : aapEvalData ? (
        <AAPHeatmap data={aapEvalData} />
      ) : (
        <div className="rounded-[12px] border border-bolt-line bg-white shadow-sm p-8 text-center">
          <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Aucune donnée d&apos;évaluation AAP. Cliquez sur &quot;Recalculer les scores AAP&quot; pour générer les scores.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Results Tab
// ---------------------------------------------------------------------------
function PipelineResultsTab({ result }: { result: ProcessDescriptorResult }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyCredentials = (teacher: PipelineTeacher, idx: number) => {
    const text = `Nom: ${teacher.name}\nUsername: ${teacher.username}\nPassword: ${teacher.password}\nEmail: ${teacher.email}`;
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // Group modules by semester
  const bySemester = (result.modules_table || []).reduce<Record<number, PipelineModule[]>>((acc, m) => {
    const s = m.semester || 0;
    if (!acc[s]) acc[s] = [];
    acc[s].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Pipeline Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-yellow-500" />
            Étapes du pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(result.steps || []).map((step, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{step.agent}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(step.details || {}).map(([k, v]) => {
                      if (Array.isArray(v) || typeof v === 'object') return null;
                      return (
                        <Badge key={k} variant="secondary" className="text-xs">
                          {k}: {String(v)}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Teachers Created */}
      {result.teachers_created && result.teachers_created.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-blue-500" />
              Enseignants créés ({result.teachers_created.length})
            </CardTitle>
            <CardDescription>
              Comptes créés automatiquement — notez les mots de passe
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.teachers_created.map((t, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1 py-0.5 rounded">{t.username}</code></TableCell>
                    <TableCell><code className="text-xs bg-muted px-1 py-0.5 rounded">{t.password}</code></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.email}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyCredentials(t, idx)}
                      >
                        {copiedIdx === idx ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Modules Table by Semester */}
      {Object.keys(bySemester).sort((a, b) => Number(a) - Number(b)).map((sem) => (
        <Card key={sem}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-5 w-5" />
              Semestre {sem} ({bySemester[Number(sem)].length} modules)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>UE</TableHead>
                  <TableHead>Enseignant</TableHead>
                  <TableHead className="w-10">Lien</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySemester[Number(sem)].map((m, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{m.code || '—'}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{m.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.ue || '—'}</TableCell>
                    <TableCell className="text-sm">{m.teacher_name || '—'}</TableCell>
                    <TableCell>
                      <Link href={m.course_link}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function ProgramDetailPage() {
  const params = useParams();
  const programId = parseInt(params.id as string);

  const { data: programData, isLoading: isProgramLoading, error } = useProgram(programId);
  const { data: coursesData } = useCourses();
  const updateProgram = useUpdateProgram();
  const addCourse = useAddCourseToProgram();
  const removeCourse = useRemoveCourseFromProgram();
  const createClass = useCreateClass();
  const uploadDescriptor = useUploadDescriptor();
  const extractDescriptor = useExtractDescriptor();
  const processDescriptor = useProcessDescriptor();
  const uploadStudyPlan = useUploadStudyPlan();
  const extractSyllabi = useExtractSyllabi();
  const deleteProgram = useDeleteProgram();

  const [pipelineResult, setPipelineResult] = useState<ProcessDescriptorResult | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', code: '', description: '', program_type: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const studyPlanInputRef = useRef<HTMLInputElement>(null);

  const handleAddCourse = (courseId: number) => {
    addCourse.mutate({ programId, data: { course_id: courseId } });
  };

  const handleRemoveCourse = (courseId: number) => {
    removeCourse.mutate({ programId, courseId });
  };

  const handleCreateClass = (data: CreateClassData) => {
    createClass.mutate({ programId, data });
  };

  const handleTypeChange = (value: string) => {
    updateProgram.mutate({ id: programId, data: { program_type: value } });
  };

  const handleFileUpload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      uploadDescriptor.mutate({ programId, file });
    }
  };

  const handleExtract = () => {
    extractDescriptor.mutate(programId);
  };

  const handleProcess = () => {
    processDescriptor.mutate(programId, {
      onSuccess: (data) => {
        setPipelineResult(data);
      },
    });
  };

  const handleStudyPlanUpload = () => {
    const file = studyPlanInputRef.current?.files?.[0];
    if (file) {
      uploadStudyPlan.mutate({ programId, file });
    }
  };

  const handleExtractSyllabi = () => {
    extractSyllabi.mutate(programId);
  };

  const handleEditOpen = () => {
    if (program) {
      setEditForm({
        name: program.name,
        code: program.code || '',
        description: program.description || '',
        program_type: program.program_type || '',
      });
      setShowEditDialog(true);
    }
  };

  const handleEditSave = () => {
    updateProgram.mutate(
      { id: programId, data: editForm },
      { onSuccess: () => setShowEditDialog(false) }
    );
  };

  const handleDeleteConfirm = () => {
    deleteProgram.mutate(programId, {
      onSuccess: () => {
        window.location.href = '/admin/programs';
      },
    });
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as any)?.response?.data?.error || 'Failed to load program details'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isProgramLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-64 mb-4" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  const program = programData?.program;
  if (!program) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Program not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/programs">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Programs
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/programs/${programId}/dashboard`}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold">{program.name}</h1>
            {program.code && (
              <Badge variant="outline" className="font-mono">{program.code}</Badge>
            )}
            {program.program_type && (
              <Badge variant="secondary">{program.program_type}</Badge>
            )}
          </div>
          {program.description && (
            <p className="text-muted-foreground">{program.description}</p>
          )}
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            <span>{program.courses_count} modules</span>
            <span>{program.classes_count} classes</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Select
            value={program.program_type || ''}
            onValueChange={handleTypeChange}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Licence">Licence</SelectItem>
              <SelectItem value="Master">Master</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleEditOpen}>
            <Pencil className="h-4 w-4 mr-1" />
            Modifier
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4 mr-1" />
            Supprimer
          </Button>
        </div>
      </div>

      {/* Descriptor upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" />
            Descripteur de formation
          </CardTitle>
          {program.descriptor_file && (
            <CardDescription>
              Fichier : {program.descriptor_file}
              {program.descriptor_uploaded_at &&
                ` — Uploadé le ${new Date(program.descriptor_uploaded_at).toLocaleDateString('fr-FR')}`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={handleFileUpload}
              disabled={uploadDescriptor.isPending}
            >
              <Upload className="h-4 w-4 mr-1" />
              {uploadDescriptor.isPending ? 'Téléchargement...' : 'Télécharger'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExtract}
              disabled={extractDescriptor.isPending || !program.descriptor_file}
            >
              <Check className="h-4 w-4 mr-1" />
              {extractDescriptor.isPending
                ? 'Extraction...'
                : 'Extraire AAP & Compétences'}
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={handleProcess}
              disabled={processDescriptor.isPending || !program.descriptor_file}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
            >
              {processDescriptor.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-1" />
              )}
              {processDescriptor.isPending
                ? 'Traitement en cours...'
                : 'Traiter le descripteur (Pipeline AI)'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Study Plan upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" />
            Plan d&apos;étude
          </CardTitle>
          {program.study_plan_file && (
            <CardDescription>
              Fichier : {program.study_plan_file}
              {program.study_plan_uploaded_at &&
                ` — Uploadé le ${new Date(program.study_plan_uploaded_at).toLocaleDateString('fr-FR')}`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              ref={studyPlanInputRef}
              type="file"
              accept=".zip,.pdf,.docx"
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={handleStudyPlanUpload}
              disabled={uploadStudyPlan.isPending}
            >
              <Upload className="h-4 w-4 mr-1" />
              {uploadStudyPlan.isPending ? 'Téléchargement...' : 'Télécharger le plan'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExtractSyllabi}
              disabled={extractSyllabi.isPending || program.courses_count === 0}
            >
              {extractSyllabi.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4 mr-1" />
              )}
              {extractSyllabi.isPending
                ? 'Extraction en cours...'
                : 'Extraire les syllabus'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Study plan upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" />
            Plan d&apos;étude
          </CardTitle>
          {program.study_plan_file && (
            <CardDescription>
              Fichier : {program.study_plan_file}
              {program.study_plan_uploaded_at &&
                ` — Uploadé le ${new Date(program.study_plan_uploaded_at).toLocaleDateString('fr-FR')}`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              ref={studyPlanInputRef}
              type="file"
              accept=".zip,.pdf,.docx"
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={handleStudyPlanUpload}
              disabled={uploadStudyPlan.isPending}
            >
              <Upload className="h-4 w-4 mr-1" />
              {uploadStudyPlan.isPending ? 'Téléchargement...' : 'Télécharger le plan'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExtractSyllabi}
              disabled={extractSyllabi.isPending || program.courses_count === 0}
            >
              {extractSyllabi.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4 mr-1" />
              )}
              {extractSyllabi.isPending
                ? 'Extraction en cours...'
                : 'Extraire les syllabus'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="infos">
        <TabsList>
          <TabsTrigger value="infos">
            <Info className="h-4 w-4 mr-1" />
            Infos
          </TabsTrigger>
          <TabsTrigger value="aap">AAP</TabsTrigger>
          <TabsTrigger value="competences">Compétences</TabsTrigger>
          <TabsTrigger value="matrix">
            <Grid3X3 className="h-4 w-4 mr-1" />
            Matrice
          </TabsTrigger>
          <TabsTrigger value="modules">
            <BookOpen className="h-4 w-4 mr-1" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="classes">
            <GraduationCap className="h-4 w-4 mr-1" />
            Classes
          </TabsTrigger>
          <TabsTrigger value="evaluation_aap">
            <Target className="h-4 w-4 mr-1" />
            Évaluation AAP
          </TabsTrigger>
          {pipelineResult && (
            <TabsTrigger value="pipeline">
              <Zap className="h-4 w-4 mr-1" />
              Pipeline
            </TabsTrigger>
          )}
        </TabsList>

        {/* Infos */}
        <TabsContent value="infos">
          <Card>
            <CardHeader>
              <CardTitle>Informations du programme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Nom</p>
                  <p>{program.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Code</p>
                  <p>{program.code || '—'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Type</p>
                  <p>{program.program_type || '—'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Créé le</p>
                  <p>{new Date(program.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Modules</p>
                  <p>{program.courses_count}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Classes</p>
                  <p>{program.classes_count}</p>
                </div>
              </div>
              {program.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Description</p>
                  <p className="whitespace-pre-wrap">{program.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AAP */}
        <TabsContent value="aap">
          <AAPTab programId={programId} />
        </TabsContent>

        {/* Compétences */}
        <TabsContent value="competences">
          <CompetencesTab programId={programId} />
        </TabsContent>

        {/* Matrix */}
        <TabsContent value="matrix">
          <MatrixTab programId={programId} />
        </TabsContent>

        {/* Modules */}
        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                <div>
                  <CardTitle>Modules du programme</CardTitle>
                  <CardDescription>
                    Gérer les modules disponibles dans ce programme
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {coursesData && (
                <AddCourseForm
                  availableCourses={coursesData.enrolled_courses}
                  programCourses={program.courses}
                  onAdd={handleAddCourse}
                  isLoading={addCourse.isPending}
                />
              )}
              <Separator />
              <ProgramCoursesList
                courses={program.courses}
                onRemove={handleRemoveCourse}
                isRemoving={removeCourse.isPending}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Classes */}
        <TabsContent value="classes">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                <div>
                  <CardTitle>Classes du programme</CardTitle>
                  <CardDescription>Créer et gérer les sections de classe</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <CreateClassForm
                onSubmit={handleCreateClass}
                isLoading={createClass.isPending}
              />
              <Separator />
              <ProgramClassesList classes={program.classes} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Évaluation AAP */}
        <TabsContent value="evaluation_aap">
          <AAPEvaluationTab programId={programId} />
        </TabsContent>

        {/* Pipeline Results */}
        {pipelineResult && (
          <TabsContent value="pipeline">
            <PipelineResultsTab result={pipelineResult} />
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le programme</DialogTitle>
            <DialogDescription>Modifier les informations du programme</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nom</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Code</label>
              <Input
                value={editForm.code}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select
                value={editForm.program_type}
                onValueChange={(v) => setEditForm({ ...editForm, program_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Licence">Licence</SelectItem>
                  <SelectItem value="Master">Master</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Annuler</Button>
            <Button onClick={handleEditSave} disabled={updateProgram.isPending}>
              {updateProgram.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le programme</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer le programme &quot;{program.name}&quot; ?
              Cette action est irréversible et supprimera tous les AAP, compétences et liens associés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteProgram.isPending}>
              {deleteProgram.isPending ? 'Suppression...' : 'Supprimer définitivement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

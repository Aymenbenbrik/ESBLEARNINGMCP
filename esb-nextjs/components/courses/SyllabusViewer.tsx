import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Syllabus } from '@/lib/types/course';
import { FileText, Download, Upload, BookOpen, Target, Calendar, GraduationCap, List, History, GitBranch, PlusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { SyllabusUploadDialog } from './SyllabusUploadDialog';
import { useSyllabus } from '@/lib/hooks/useSyllabus';
import { TNChapter, TNStructured } from '@/lib/api/syllabus';
import { SyllabusVersionHistory } from '@/components/syllabus/SyllabusVersionHistory';
import { ProposeRevisionDialog } from '@/components/syllabus/ProposeRevisionDialog';
import { AAMappingTable } from '@/components/syllabus/AAMappingTable';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { syllabusVersionsApi } from '@/lib/api/syllabusVersions';
import type { SyllabusSnapshot } from '@/lib/types/syllabusVersions';

interface SyllabusViewerProps {
  syllabus: Syllabus | null;
  syllabusType?: 'BGA' | 'TN' | null;
  courseId: number;
  canEdit?: boolean;
}

function TNSyllabusView({ tn, courseId }: { tn: TNStructured; courseId?: number }) {
  const adm = tn.administrative;
  const defaultTab = tn.aa?.length > 0 ? 'aa' : tn.chapters?.length > 0 ? 'chapters' : 'eval';

  return (
    <div className="space-y-4">
      {/* Administrative header */}
      {adm && (
        <div className="grid grid-cols-2 gap-2 text-sm p-3 bg-muted/50 rounded-lg">
          {adm.code_ue && <div><span className="font-medium">Code UE : </span>{adm.code_ue}</div>}
          {adm.department && <div><span className="font-medium">Département : </span>{adm.department}</div>}
          {adm.field && <div><span className="font-medium">Filière : </span>{adm.field}</div>}
          {adm.option && <div><span className="font-medium">Option : </span>{adm.option}</div>}
          {adm.volume_presentiel && <div><span className="font-medium">Volume présentiel : </span>{adm.volume_presentiel}</div>}
          {adm.credits && <div><span className="font-medium">Crédits ECTS : </span>{adm.credits}</div>}
          {adm.responsible && <div><span className="font-medium">Responsable : </span>{adm.responsible}</div>}
          {adm.teachers?.length > 0 && (
            <div className="col-span-2"><span className="font-medium">Enseignants : </span>{adm.teachers.join(', ')}</div>
          )}
        </div>
      )}

      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-4 flex-wrap h-auto">
          {tn.aa?.length > 0 && (
            <TabsTrigger value="aa" className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              Acquis d'Apprentissage
              <Badge variant="secondary" className="ml-1 text-xs">{tn.aa.length}</Badge>
            </TabsTrigger>
          )}
          {tn.chapters?.length > 0 && (
            <TabsTrigger value="chapters" className="flex items-center gap-1">
              <List className="h-3 w-3" />
              Contenu
              <Badge variant="secondary" className="ml-1 text-xs">{tn.chapters.length}</Badge>
            </TabsTrigger>
          )}
          {tn.evaluation && (
            <TabsTrigger value="eval" className="flex items-center gap-1">
              <GraduationCap className="h-3 w-3" />
              Évaluation
            </TabsTrigger>
          )}
          {tn.bibliography?.length > 0 && (
            <TabsTrigger value="bib" className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              Bibliographie
              <Badge variant="secondary" className="ml-1 text-xs">{tn.bibliography.length}</Badge>
            </TabsTrigger>
          )}
        </TabsList>

        {/* AA Tab */}
        {tn.aa?.length > 0 && (
          <TabsContent value="aa">
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">N°</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tn.aa.map((aa) => (
                    <TableRow key={aa.number}>
                      <TableCell className="font-medium">AA{aa.number}</TableCell>
                      <TableCell>{aa.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        )}

        {/* Chapters Tab */}
        {tn.chapters?.length > 0 && (
          <TabsContent value="chapters">
            <div className="space-y-3">
              {tn.chapters.map((ch: TNChapter) => (
                <div key={ch.index} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 font-medium">
                    <Badge variant="outline" className="text-xs">Ch. {ch.index}</Badge>
                    {ch.title}
                    {ch.aa_links?.length > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {ch.aa_links.map(l => `AA${l.aa_number}`).join(', ')}
                      </span>
                    )}
                  </div>
                  {ch.sections?.length > 0 && (
                    <div className="divide-y">
                      {ch.sections.map((sec) => (
                        <div key={sec.index} className="flex items-start gap-3 px-4 py-2 text-sm">
                          <span className="text-muted-foreground font-mono w-12 shrink-0">{sec.index}</span>
                          <span className="flex-1">{sec.title}</span>
                          {sec.aa_links?.length > 0 && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {sec.aa_links.map(l => `AA${l.aa_number}`).join(', ')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        )}

        {/* Evaluation Tab */}
        {tn.evaluation && (
          <TabsContent value="eval">
            <div className="space-y-3">
              {tn.evaluation.final_grade_formula && (
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <p className="text-sm font-medium text-primary mb-1">Formule de notation finale</p>
                  <p className="text-sm">{tn.evaluation.final_grade_formula}</p>
                </div>
              )}
              {tn.evaluation.methods?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Méthodes d'évaluation</p>
                  <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                    {tn.evaluation.methods.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
              {tn.evaluation.criteria?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Critères d'évaluation</p>
                  <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                    {tn.evaluation.criteria.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
              {tn.evaluation.measures?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Mesures</p>
                  <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                    {tn.evaluation.measures.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* Bibliography Tab */}
        {tn.bibliography?.length > 0 && (
          <TabsContent value="bib">
            <ol className="space-y-2">
              {tn.bibliography.map((bib) => (
                <li key={bib.position} className="text-sm flex gap-2">
                  <span className="text-muted-foreground font-mono shrink-0">[{bib.position}]</span>
                  <span>{bib.entry}</span>
                </li>
              ))}
            </ol>
          </TabsContent>
        )}
      </Tabs>

      {/* AA ↔ AAP Mapping (collapsible) */}
      {tn.aa?.length > 0 && tn.aap?.some(a => a.selected) && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full mt-4 py-2 px-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors text-sm font-medium group cursor-pointer">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            Correspondance AA ↔ AAP de la formation
          </CollapsibleTrigger>
          <CollapsibleContent>
            <AAMappingTable aas={tn.aa} aaps={tn.aap} courseId={courseId} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export function SyllabusViewer({ syllabus, syllabusType, courseId, canEdit = false }: SyllabusViewerProps) {
  const { data: syllabusData, isLoading: syllabusLoading } = useSyllabus(
    syllabus ? courseId : 0
  );

  const [proposeOpen, setProposeOpen] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<SyllabusSnapshot | undefined>(undefined);

  const openPropose = async () => {
    try {
      // Load the latest version snapshot to pre-fill the form
      const res = await syllabusVersionsApi.list(courseId);
      const latest = res.versions.at(-1);
      if (latest) {
        const detail = await syllabusVersionsApi.get(courseId, latest.id);
        setLiveSnapshot(detail.snapshot);
      }
    } catch {
      // proceed without pre-fill
    }
    setProposeOpen(true);
  };

  const getDownloadUrl = () => {
    if (!syllabus?.file_path) return null;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    return `${API_URL}/uploads/${syllabus.file_path}`;
  };

  const downloadUrl = getDownloadUrl();

  const isTN = syllabusData?.syllabus_type === 'tn' || syllabus?.syllabus_type === 'tn';
  const tnStructured: TNStructured | null = syllabusData?.tn_structured ?? null;

  const cloData: any[] = Array.isArray(syllabusData?.clo_data) ? syllabusData.clo_data : [];
  const ploData: any[] = Array.isArray(syllabusData?.plo_data) ? syllabusData.plo_data : [];
  const weeklyPlan: any[] = Array.isArray(syllabusData?.weekly_plan) ? syllabusData.weekly_plan : [];

  const hasBGAStructure = cloData.length > 0 || ploData.length > 0 || weeklyPlan.length > 0;
  const hasTNStructure = tnStructured && (
    (tnStructured.aa?.length > 0) ||
    (tnStructured.chapters?.length > 0)
  );
  const hasStructure = hasBGAStructure || !!hasTNStructure;

  // If no syllabus and user can edit, show upload prompt
  if (!syllabus && canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Syllabus</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <p className="font-medium">No syllabus uploaded</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Upload a syllabus to automatically generate chapters and extract learning outcomes
              </p>
            </div>
            <SyllabusUploadDialog courseId={courseId} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!syllabus) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Syllabus</CardTitle>
            {syllabusType && <Badge variant="outline">{syllabusType}</Badge>}
            {hasStructure && <Badge variant="secondary" className="text-xs">Extrait</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && isTN && (
              <Button size="sm" variant="outline" className="text-blue-700 border-blue-300 hover:bg-blue-50"
                onClick={openPropose}>
                <PlusCircle className="h-4 w-4 mr-1" />
                Proposer une révision
              </Button>
            )}
            {canEdit && (
              <SyllabusUploadDialog
                courseId={courseId}
                trigger={
                  <Button size="sm" variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Replace
                  </Button>
                }
              />
            )}
            {downloadUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={downloadUrl} download>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {syllabusLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="content">
            <TabsList className="mb-4">
              <TabsTrigger value="content" className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" /> Contenu
              </TabsTrigger>
              <TabsTrigger value="versions" className="flex items-center gap-1">
                <History className="h-3 w-3" /> Versions
              </TabsTrigger>
            </TabsList>

            {/* ── Content tab ── */}
            <TabsContent value="content">
              {isTN && hasTNStructure ? (
                <TNSyllabusView tn={tnStructured!} courseId={courseId} />
              ) : !isTN && hasBGAStructure ? (
          <Tabs defaultValue={weeklyPlan.length > 0 ? 'weekly' : cloData.length > 0 ? 'clo' : 'plo'}>
            <TabsList className="mb-4">
              {weeklyPlan.length > 0 && (
                <TabsTrigger value="weekly" className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Plan hebdomadaire
                  <Badge variant="secondary" className="ml-1 text-xs">{weeklyPlan.length}</Badge>
                </TabsTrigger>
              )}
              {cloData.length > 0 && (
                <TabsTrigger value="clo" className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  CLO
                  <Badge variant="secondary" className="ml-1 text-xs">{cloData.length}</Badge>
                </TabsTrigger>
              )}
              {ploData.length > 0 && (
                <TabsTrigger value="plo" className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  PLO
                  <Badge variant="secondary" className="ml-1 text-xs">{ploData.length}</Badge>
                </TabsTrigger>
              )}
            </TabsList>

            {weeklyPlan.length > 0 && (
              <TabsContent value="weekly">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Semaine</TableHead>
                        <TableHead>Thème / Topic</TableHead>
                        <TableHead>Activités</TableHead>
                        <TableHead className="w-24">CLO</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weeklyPlan.map((week: any, idx: number) => {
                        const weekNum = week['Week#'] ?? week.week_number ?? idx + 1;
                        const topic = week.Topic ?? week.topics ?? week.topic ?? '—';
                        const activities = week.Activities ?? week.activities ?? week.activity ?? '';
                        const clos = week.CLOs ?? week.clos ?? week.CLO ?? '';
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium text-center">{weekNum}</TableCell>
                            <TableCell>{Array.isArray(topic) ? topic.join(', ') : String(topic)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {Array.isArray(activities) ? activities.join(', ') : String(activities || '—')}
                            </TableCell>
                            <TableCell className="text-xs text-center">
                              {Array.isArray(clos) ? clos.join(', ') : String(clos || '—')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            )}

            {cloData.length > 0 && (
              <TabsContent value="clo">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">N°</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-20 text-right">Poids</TableHead>
                        <TableHead className="w-20 text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cloData.map((clo: any, idx: number) => {
                        const num = clo.number ?? clo['CLO#'] ?? clo.clo_number ?? idx + 1;
                        const desc = clo.description ?? clo.Description ?? clo.text ?? '—';
                        const weight = clo.weight ?? clo.Weight ?? '—';
                        const percent = clo.percent ?? clo.Percent ?? clo['%'] ?? '—';
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">CLO {num}</TableCell>
                            <TableCell>{String(desc)}</TableCell>
                            <TableCell className="text-right">{String(weight)}</TableCell>
                            <TableCell className="text-right">{String(percent)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            )}

            {ploData.length > 0 && (
              <TabsContent value="plo">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">N°</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ploData.map((plo: any, idx: number) => {
                        const num = plo.number ?? plo['PLO#'] ?? plo.plo_number ?? idx + 1;
                        const desc = plo.description ?? plo.Description ?? plo.text ?? '—';
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">PLO {num}</TableCell>
                            <TableCell>{String(desc)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            )}
          </Tabs>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-lg border bg-accent/50">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">Syllabus du cours</p>
                    <p className="text-sm text-muted-foreground">
                      {syllabus.syllabus_type?.toUpperCase()} — pas encore extrait
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── Versions tab ── */}
            <TabsContent value="versions">
              <SyllabusVersionHistory
                courseId={courseId}
                canEdit={canEdit}
                canValidate={canEdit}
              />
            </TabsContent>
          </Tabs>
        )}

        {/* Propose revision dialog */}
        <ProposeRevisionDialog
          open={proposeOpen}
          onOpenChange={setProposeOpen}
          courseId={courseId}
          currentSnapshot={liveSnapshot}
        />
      </CardContent>
    </Card>
  );
}

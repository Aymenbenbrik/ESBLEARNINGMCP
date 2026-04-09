'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Check, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api/client';

interface AAMappingTableProps {
  aas: { number: number; description: string }[];
  aaps: { number: number; selected: boolean }[];
  courseId?: number;
}

interface MappingData {
  aas: { id: number; number: number; description: string }[];
  aaps: { id: number; code: string; description: string }[];
  mapping: { aa_id: number; aap_id: number; linked: boolean }[];
}

export function AAMappingTable({ aas, aaps, courseId }: AAMappingTableProps) {
  const selectedAAPs = aaps.filter((a) => a.selected).sort((a, b) => a.number - b.number);
  const [mappingData, setMappingData] = useState<MappingData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    apiClient
      .get(`/api/v1/programs/courses/${courseId}/aa-aap-mapping`)
      .then((res) => setMappingData(res.data))
      .catch(() => setMappingData(null))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (aas.length === 0 || selectedAAPs.length === 0) return null;

  // Use real mapping if available, otherwise show all as linked (fallback)
  const hasRealData = mappingData && mappingData.aaps.length > 0;
  const displayAaps = hasRealData
    ? mappingData.aaps
    : selectedAAPs.map((a) => ({ id: a.number, code: `AAP ${a.number}`, description: '' }));

  const linkSet = new Set<string>();
  if (hasRealData) {
    for (const m of mappingData.mapping) {
      if (m.linked) linkSet.add(`${m.aa_id}-${m.aap_id}`);
    }
  }

  const isLinked = (aaNum: number, aapId: number) => {
    if (!hasRealData) return true; // fallback: all linked
    const aaObj = mappingData!.aas.find((a) => a.number === aaNum);
    if (!aaObj) return false;
    return linkSet.has(`${aaObj.id}-${aapId}`);
  };

  const rotateHeaders = displayAaps.length > 6;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          Correspondance AA ↔ AAP de la formation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">AA</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    {displayAaps.map((aap) => (
                      <TableHead
                        key={aap.id}
                        className="text-center w-14 px-1"
                        title={aap.description || `AAP ${aap.code}`}
                      >
                        <span
                          className={
                            rotateHeaders
                              ? 'inline-block -rotate-45 origin-bottom-left whitespace-nowrap text-xs'
                              : 'text-xs'
                          }
                        >
                          {aap.code}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aas.map((aa) => (
                    <TableRow key={aa.number}>
                      <TableCell className="font-medium whitespace-nowrap">
                        AA&nbsp;{aa.number}
                      </TableCell>
                      <TableCell
                        className="max-w-[300px] truncate"
                        title={aa.description}
                      >
                        {aa.description}
                      </TableCell>
                      {displayAaps.map((aap) => (
                        <TableCell key={aap.id} className="text-center px-1">
                          {isLinked(aa.number, aap.id) ? (
                            <Check className="h-4 w-4 text-green-600 mx-auto" />
                          ) : (
                            <Minus className="h-3 w-3 text-muted-foreground/30 mx-auto" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!hasRealData && (
              <p className="text-xs text-muted-foreground mt-2">
                Les correspondances détaillées seront disponibles après extraction depuis le descripteur de la formation.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

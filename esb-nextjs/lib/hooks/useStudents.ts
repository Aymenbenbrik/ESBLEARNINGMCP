import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsApi, AllStudentsResponse, GenerateStudentsRequest, GeneratedStudent } from '../api/students';
import { toast } from 'sonner';

export const studentKeys = {
  all: ['students'] as const,
  list: (params?: { class_id?: number; search?: string }) => [...studentKeys.all, 'list', params] as const,
};

/** List all students with optional filters */
export function useAllStudents(params?: { class_id?: number; search?: string }) {
  return useQuery<AllStudentsResponse>({
    queryKey: studentKeys.list(params),
    queryFn: () => studentsApi.listAll(params),
  });
}

/** Generate batch of students */
export function useGenerateStudents() {
  const qc = useQueryClient();

  return useMutation<{ students: GeneratedStudent[]; count: number }, Error, GenerateStudentsRequest>({
    mutationFn: studentsApi.generate,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: studentKeys.all });
      toast.success(`${data.count} étudiant(s) généré(s) avec succès`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la génération');
    },
  });
}

/** Reset a student's password */
export function useResetStudentPassword() {
  const qc = useQueryClient();

  return useMutation<{ message: string; new_password: string }, Error, number>({
    mutationFn: studentsApi.resetPassword,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: studentKeys.all });
      toast.success(`Mot de passe réinitialisé : ${data.new_password}`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la réinitialisation');
    },
  });
}

/** Export students CSV */
export function useExportStudentsCsv() {
  return useMutation<void, Error, number | undefined>({
    mutationFn: async (classId) => {
      const response = await studentsApi.exportCsv(classId);
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'students_export.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onError: (error: any) => {
      toast.error('Erreur lors de l\'export');
    },
  });
}

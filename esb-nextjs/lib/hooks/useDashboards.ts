import { useQuery } from '@tanstack/react-query';
import { dashboardsApi } from '@/lib/api/dashboards';

export function useMyDashboard() {
  return useQuery({
    queryKey: ['dashboards', 'me'],
    queryFn: dashboardsApi.getMyDashboard,
    staleTime: 1000 * 30,
  });
}

export function useProgramDashboard(programId: number) {
  return useQuery({
    queryKey: ['dashboards', 'program', programId],
    queryFn: () => dashboardsApi.getProgramDashboard(programId),
    enabled: !!programId,
    staleTime: 1000 * 30,
  });
}

export function useClassDashboard(classId: number) {
  return useQuery({
    queryKey: ['dashboards', 'class', classId],
    queryFn: () => dashboardsApi.getClassDashboard(classId),
    enabled: !!classId,
    staleTime: 1000 * 15,
  });
}

export function useStudentDashboard(studentId: number) {
  return useQuery({
    queryKey: ['dashboards', 'student', studentId],
    queryFn: () => dashboardsApi.getStudentDashboard(studentId),
    enabled: !!studentId,
    staleTime: 1000 * 15,
  });
}

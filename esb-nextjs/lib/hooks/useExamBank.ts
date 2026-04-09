'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { examBankApi } from '@/lib/api/exam-bank';
import type { CreateExamData, ValidatedExam, ExamBankQuestion } from '@/lib/types/exam-bank';

// ── Query Keys ────────────────────────────────────────────────────────────

export const examBankKeys = {
  all: ['exam-bank'] as const,
  exams: (courseId: number) => ['exam-bank', 'exams', courseId] as const,
  exam: (examId: number) => ['exam-bank', 'exam', examId] as const,
  session: (sessionId: number) => ['exam-bank', 'session', sessionId] as const,
  sessionResults: (sessionId: number) => ['exam-bank', 'session-results', sessionId] as const,
  examResults: (examId: number) => ['exam-bank', 'exam-results', examId] as const,
  photo: (studentId: number) => ['exam-bank', 'photo', studentId] as const,
};

// ── Exam hooks ────────────────────────────────────────────────────────────

export function useExams(courseId: number) {
  return useQuery({
    queryKey: examBankKeys.exams(courseId),
    queryFn: () => examBankApi.listExams(courseId).then(r => r.data),
    enabled: !!courseId,
  });
}

export function useExam(examId: number) {
  return useQuery({
    queryKey: examBankKeys.exam(examId),
    queryFn: () => examBankApi.getExam(examId).then(r => r.data),
    enabled: !!examId,
  });
}

export function useCreateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateExamData) => examBankApi.createExam(data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: examBankKeys.exams(vars.course_id) });
    },
  });
}

export function useUpdateExam(examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ValidatedExam> & { exam_password?: string }) =>
      examBankApi.updateExam(examId, data).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: examBankKeys.exam(examId) });
      qc.invalidateQueries({ queryKey: examBankKeys.exams(data.course_id) });
    },
  });
}

export function useGenerateFromTn(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: import('@/lib/types/exam-bank').GenerateFromTnData) =>
      examBankApi.generateFromTn(data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examBankKeys.exams(courseId) });
    },
  });
}

export function useDeleteExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (examId: number) => examBankApi.deleteExam(examId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examBankKeys.all });
    },
  });
}

export function useGenerateAnswers(examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => examBankApi.generateAnswers(examId).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examBankKeys.exam(examId) });
    },
  });
}

// ── Question hooks ────────────────────────────────────────────────────────

export function useAddQuestion(examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ExamBankQuestion>) =>
      examBankApi.addQuestion(examId, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examBankKeys.exam(examId) });
    },
  });
}

export function useDeleteQuestion(examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questionId: number) => examBankApi.deleteQuestion(examId, questionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examBankKeys.exam(examId) });
    },
  });
}

// ── Session hooks ─────────────────────────────────────────────────────────

export function useStartSession() {
  return useMutation({
    mutationFn: ({ examId, isPreview }: { examId: number; isPreview?: boolean }) =>
      examBankApi.startSession(examId, isPreview).then(r => r.data),
  });
}

export function useExamSession(sessionId: number) {
  return useQuery({
    queryKey: examBankKeys.session(sessionId),
    queryFn: () => examBankApi.getSession(sessionId).then(r => r.data),
    enabled: !!sessionId,
  });
}

export function useSubmitSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, timeSpent }: { sessionId: number; timeSpent: number }) =>
      examBankApi.submitSession(sessionId, timeSpent).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: examBankKeys.session(data.id) });
      qc.invalidateQueries({ queryKey: examBankKeys.sessionResults(data.id) });
    },
  });
}

export function useSessionResults(sessionId: number) {
  return useQuery({
    queryKey: examBankKeys.sessionResults(sessionId),
    queryFn: () => examBankApi.getSessionResults(sessionId).then(r => r.data),
    enabled: !!sessionId,
  });
}

export function useExamResults(examId: number) {
  return useQuery({
    queryKey: examBankKeys.examResults(examId),
    queryFn: () => examBankApi.getExamResults(examId).then(r => r.data),
    enabled: !!examId,
  });
}

export function usePublishExam(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (examId: number) => examBankApi.publishExam(examId).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: examBankKeys.exam(data.id) });
      qc.invalidateQueries({ queryKey: examBankKeys.exams(courseId) });
    },
  });
}

export function useUnpublishExam(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (examId: number) => examBankApi.unpublishExam(examId).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: examBankKeys.exam(data.id) });
      qc.invalidateQueries({ queryKey: examBankKeys.exams(courseId) });
    },
  });
}

export function useAutoCorrect(examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => examBankApi.autoCorrect(examId).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examBankKeys.examResults(examId) });
    },
  });
}

export function useValidateScore(sessionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { question_id: number; score: number; feedback?: string }) =>
      examBankApi.validateScore(sessionId, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examBankKeys.session(sessionId) });
    },
  });
}

// ── Photo hooks ───────────────────────────────────────────────────────────

export function useStudentPhoto(studentId: number) {
  return useQuery({
    queryKey: examBankKeys.photo(studentId),
    queryFn: () => examBankApi.checkStudentPhoto(studentId).then(r => r.data),
    enabled: !!studentId,
  });
}

export function useUploadStudentPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, photo }: { studentId: number; photo: File }) =>
      examBankApi.uploadStudentPhoto(studentId, photo),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: examBankKeys.photo(vars.studentId) });
    },
  });
}

export function usePublishFeedbacks(examId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { session_ids: number[]; message?: string }) =>
      examBankApi.publishFeedbacks(examId, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examBankKeys.examResults(examId) });
    },
  });
}

export function useUpdateSessionFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: number; data: { feedback?: string; score?: number } }) =>
      examBankApi.updateSessionFeedback(sessionId, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: examBankKeys.session(vars.sessionId) });
    },
  });
}

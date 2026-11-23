'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { act } from '@/services/reports';
export function useAction() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; action: string; body?: object }) => act(v.id, v.action, v.body), onSuccess: () => qc.invalidateQueries() });
}

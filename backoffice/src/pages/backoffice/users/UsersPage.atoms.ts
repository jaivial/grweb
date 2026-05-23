import { atom } from 'jotai';
import type { CompetitionMember, UserRole } from '../../../types/api';

export const competitionMembersAtom = atom<CompetitionMember[]>([]);
export const competitionMembersLoadingAtom = atom<boolean>(false);
export const competitionMembersErrorAtom = atom<string | null>(null);
export const selectedMemberAtom = atom<CompetitionMember | null>(null);
export const selectedRoleAtom = atom<UserRole | null>(null);
export const isCreateMemberOpenAtom = atom<boolean>(false);
export const isSavingMemberAtom = atom<boolean>(false);
export const createMemberFormAtom = atom({
  nombre: '',
  email: '',
  password: '',
  role: 'staff' as UserRole,
});

export interface UsersPaginationState {
  page: number;
  pageSize: number;
  search: string;
  role: UserRole | null;
  totalCount: number;
  totalPages: number;
}

export const usersPaginationAtom = atom<UsersPaginationState>({
  page: 1,
  pageSize: 20,
  search: '',
  role: null,
  totalCount: 0,
  totalPages: 0,
});

export const usersRoleCountsAtom = atom<Record<string, number>>({});

import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { useCallback, useEffect } from 'react';
import { userAtom, isLoadingAuthAtom, currentCompeticionIdAtom } from '../stores/auth.atoms';
import api from '../api/client';
import type { LoginRequest, Usuario } from '../types/api';
import toast from 'react-hot-toast';

export function useAuth() {
  const [user, setUser] = useAtom(userAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAuthAtom);
  const setCurrentCompeticionId = useSetAtom(currentCompeticionIdAtom);

  // Initialize auth state from cookie
  useEffect(() => {
    const initAuth = async () => {
      try {
        const result = await api.getMe();
        if (result.success && result.data) {
          setUser(result.data);
          // Set first competition as current
          if (result.data.competiciones && result.data.competiciones.length > 0) {
            setCurrentCompeticionId(result.data.competiciones[0].id);
          }
        }
      } catch (error) {
        console.error('Auth init error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [setUser, setCurrentCompeticionId, setIsLoading]);

  const login = useCallback(async (credentials: LoginRequest): Promise<boolean> => {
    setIsLoading(true);
    try {
      const result = await api.login(credentials);
      if (result.success && result.data) {
        setUser(result.data);
        if (result.data.competiciones && result.data.competiciones.length > 0) {
          setCurrentCompeticionId(result.data.competiciones[0].id);
        }
        toast.success('Sesión iniciada');
        return true;
      } else {
        toast.error(result.message || 'Error al iniciar sesión');
        return false;
      }
    } catch (error) {
      toast.error('Error al iniciar sesión');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [setUser, setCurrentCompeticionId, setIsLoading]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      document.cookie = 'gr_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      toast.success('Sesión cerrada');
    }
  }, [setUser]);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    isSuperadmin: user?.isSuperadmin ?? false,
    login,
    logout,
  };
}

export function useUser() {
  return useAtomValue(userAtom);
}

export function useIsAuthenticated() {
  return useAtomValue((get) => get(userAtom) !== null);
}

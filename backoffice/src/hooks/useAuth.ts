import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { useCallback, useEffect } from 'react';
import { userAtom, isAuthenticatedAtom, isLoadingAuthAtom, currentCompeticionIdAtom } from '../stores/auth.atoms';
import api from '../api/client';
import type { LoginRequest, Usuario } from '../types/api';
import toast from 'react-hot-toast';

let authInitPromise: Promise<void> | null = null;
let hasInitializedAuth = false;

interface UseAuthOptions {
  bootstrap?: boolean;
}

export function useAuth({ bootstrap = true }: UseAuthOptions = {}) {
  const [user, setUser] = useAtom(userAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAuthAtom);
  const setCurrentCompeticionId = useSetAtom(currentCompeticionIdAtom);

  // Initialize auth state from cookie
  useEffect(() => {
    if (!bootstrap) return;

    if (hasInitializedAuth) {
      setIsLoading(false);
      return;
    }

    if (!authInitPromise) {
      setIsLoading(true);
      authInitPromise = (async () => {
        try {
          const result = await api.getMe();
          if (result.success && result.data) {
            setUser(result.data);
            // Do NOT set currentCompeticionIdAtom here anymore.
            // The URL slug will drive the atom via useCompeticionSlug.
            // We still set a fallback for cases where the user is on
            // a non-backoffice page (the atom needs a default).
            if (result.data.competiciones && result.data.competiciones.length > 0) {
              setCurrentCompeticionId(result.data.competiciones[0].id);
            }
          }
        } catch (error) {
          console.error('Auth init error:', error);
        } finally {
          hasInitializedAuth = true;
          setIsLoading(false);
        }
      })();
    }

    void authInitPromise;
  }, [bootstrap, setUser, setCurrentCompeticionId, setIsLoading]);

  const login = useCallback(async (credentials: LoginRequest): Promise<Usuario | null> => {
    setIsLoading(true);
    try {
      const result = await api.login(credentials);
      if (result.success && result.data) {
        setUser(result.data);
        hasInitializedAuth = true;
        if (result.data.competiciones && result.data.competiciones.length > 0) {
          setCurrentCompeticionId(result.data.competiciones[0].id);
        }
        toast.success('Sesión iniciada');
        return result.data;
      } else {
        toast.error(result.message || 'Error al iniciar sesión');
        return null;
      }
    } catch (error) {
      toast.error('Error al iniciar sesión');
      return null;
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
      hasInitializedAuth = false;
      authInitPromise = null;
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
  return useAtomValue(isAuthenticatedAtom);
}

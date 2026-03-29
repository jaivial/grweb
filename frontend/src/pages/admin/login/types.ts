// Admin Login page types

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginState {
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

export interface LoginActions {
  login: (credentials: LoginCredentials) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export interface ValidationError {
  field: string;
  message: string;
}

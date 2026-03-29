import type { JSX } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { LoginForm, ErrorAlert, DemoCredentials } from './components';
import { useLogin } from './hooks';

/**
 * Admin Login Page
 * 
 * Provides authentication for the admin panel.
 * Validates credentials and redirects to dashboard on success.
 */
export function Login(): JSX.Element {
  const [location, setLocation] = useLocation();
  const { 
    isLoading, 
    error, 
    isAuthenticated, 
    login, 
    clearError,
    getFieldError,
    verifyExistingToken,
  } = useLogin();

  // Check for existing valid token on mount
  useEffect(() => {
    verifyExistingToken().then((valid) => {
      if (valid) {
        setLocation('/admin/dashboard');
      }
    });
  }, [verifyExistingToken, setLocation]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLocation('/admin/dashboard');
    }
  }, [isAuthenticated, setLocation]);

  // Handle form submission
  const handleSubmit = async (username: string, password: string) => {
    const success = await login({ username, password });
    if (success) {
      setLocation('/admin/dashboard');
    }
  };

  return (
    <main className="min-h-screen bg-dark-base flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Admin Login</h1>
          <p className="text-gray-400">Sign in to access the GR Cup admin panel</p>
        </div>

        {/* Login Card */}
        <div className="bg-dark-surface rounded-2xl border border-dark-border p-8">
          {/* Error Alert */}
          {error && (
            <div className="mb-6">
              <ErrorAlert message={error} onDismiss={clearError} />
            </div>
          )}

          {/* Login Form */}
          <LoginForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            usernameError={getFieldError('username')}
            passwordError={getFieldError('password')}
          />

          {/* Demo Credentials */}
          <DemoCredentials />
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <a 
            href="/" 
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors inline-flex items-center gap-2"
          >
            ← Back to home
          </a>
        </div>
      </div>
    </main>
  );
}

export default Login;

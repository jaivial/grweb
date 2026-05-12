import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../../hooks/useAuth';

export default function Login() {
  const [, navigate] = useLocation();
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setLocalError(null);

    if (!username.trim()) {
      setLocalError('Username is required');
      return;
    }

    if (!password.trim()) {
      setLocalError('Password is required');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }

    const user = await login({ email: username.trim(), password });

    if (user) {
      // Use the first competition's slug for the redirect
      const firstSlug = user.competiciones && user.competiciones.length > 0
        ? user.competiciones[0].slug
        : '';
      navigate(firstSlug ? `/backoffice/${firstSlug}` : '/backoffice');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-base px-4 py-12" data-ui="login-page">
      <div className="w-full max-w-md" data-ui="login-container">
        <div className="text-center mb-8 animate-fade-in" data-ui="login-header">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-red-accent to-dark-red mb-6" data-ui="login-logo">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-ui="login-lock-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2" data-ui="login-title">Admin Login</h1>
          <p className="text-gray-400" data-ui="login-subtitle">Panel de Administracion</p>
        </div>

        <div className="bg-dark-surface rounded-2xl p-8 border border-gray-700 shadow-red-accent animate-slide-up" data-ui="login-form-card">
          <form onSubmit={handleSubmit} className="space-y-6" data-testid="login-form">
            {localError && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-start gap-3" data-ui="login-error-alert">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-ui="login-error-icon">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div data-ui="login-error-content">
                  <p className="text-red-500 font-semibold text-sm" data-ui="login-error-title">Login Failed</p>
                  <p className="text-red-400 text-sm mt-1" data-ui="login-error-message">{localError}</p>
                </div>
              </div>
            )}

            <div data-ui="login-field-username">
              <label htmlFor="username" className="block text-white font-semibold mb-2" data-ui="login-username-label">
                Username
              </label>
              <div className="relative" data-ui="login-username-input-wrapper">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none" data-ui="login-username-icon-wrapper">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-ui="login-username-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                  </svg>
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  value={username}
                  onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
                  className="w-full text-base bg-dark-base border-2 border-gray-700 rounded-lg py-3 pl-12 pr-4 text-white placeholder-gray-500 focus:border-red-accent focus:outline-none transition-colors"
                  placeholder="Enter your username"
                  disabled={isLoading}
                  autoComplete="username"
                  data-testid="login-username-input"
                />
              </div>
            </div>

            <div data-ui="login-field-password">
              <label htmlFor="password" className="block text-white font-semibold mb-2" data-ui="login-password-label">
                Password
              </label>
              <div className="relative" data-ui="login-password-input-wrapper">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none" data-ui="login-password-icon-wrapper">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-ui="login-password-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                  </svg>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                  className="w-full text-base bg-dark-base border-2 border-gray-700 rounded-lg py-3 pl-12 pr-4 text-white placeholder-gray-500 focus:border-red-accent focus:outline-none transition-colors"
                  placeholder="Enter your password"
                  disabled={isLoading}
                  autoComplete="current-password"
                  data-testid="login-password-input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-red-accent to-dark-red text-white font-bold py-4 rounded-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              data-testid="login-submit-btn"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" data-ui="login-spinner"></div>
                  Signing in...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-ui="login-submit-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path>
                  </svg>
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="mt-6 p-4 bg-dark-base rounded-lg border border-gray-700" data-ui="login-credentials-notice">
            <div className="flex items-start gap-3" data-ui="login-credentials-content">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-ui="login-info-icon">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
              </svg>
              <p className="text-sm text-gray-500" data-ui="login-credentials-text">
                Si necesitas acceso, contacta al administrador de la plataforma.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mt-8" data-ui="login-back-home">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-red-accent transition-colors flex items-center justify-center gap-2 mx-auto"
            data-testid="login-back-home-btn"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-ui="login-back-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            Back to Home
          </button>
        </div>

      </div>
    </div>
  );
}

import type { JSX } from 'react';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { Spinner } from '@components/ui/Spinner';
import { Card } from '@components/ui/Card';
import { Icon } from '@components/ui/Icon';

interface LoginFormProps {
  onSubmit: (username: string, password: string) => void;
  isLoading: boolean;
  usernameError?: string;
  passwordError?: string;
}

/**
 * Login Form Component
 */
export function LoginForm({ 
  onSubmit, 
  isLoading, 
  usernameError, 
  passwordError 
}: LoginFormProps): JSX.Element {
  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const username = (form.elements.namedItem('username') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    onSubmit(username, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Username */}
      <Input
        name="username"
        type="text"
        label="Username"
        placeholder="Enter your username"
        error={usernameError}
        disabled={isLoading}
        autoComplete="username"
        required
      />

      {/* Password */}
      <Input
        name="password"
        type="password"
        label="Password"
        placeholder="Enter your password"
        error={passwordError}
        disabled={isLoading}
        autoComplete="current-password"
        required
      />

      {/* Submit Button */}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        isLoading={isLoading}
        disabled={isLoading}
      >
        {isLoading ? 'Signing in...' : 'Sign In'}
      </Button>
    </form>
  );
}

export default LoginForm;

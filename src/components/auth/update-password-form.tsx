'use client';

import { useState } from 'react';

import { toast } from 'sonner';

import { createClient } from '@/lib/auth/supabase-client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';

const MIN_PASSWORD_LENGTH = 8;

interface UpdatePasswordFormProps {
  onSuccess?: () => void;
  submitLabel?: string;
}

export function UpdatePasswordForm({
  onSuccess,
  submitLabel = 'Update password',
}: UpdatePasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setShowConfirm(true);
  }

  async function handleConfirm(): Promise<void> {
    setIsSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setIsSubmitting(false);

    if (error) {
      toast.error('Failed to update password. Please try again.');
      console.error('Update password error:', error);
      return;
    }

    setPassword('');
    setConfirmPassword('');
    setShowConfirm(false);
    toast.success('Password updated.');
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Updating…' : submitLabel}
      </Button>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Update your password?"
        description="You'll use this new password the next time you sign in."
        confirmLabel={submitLabel}
        pendingLabel="Updating…"
        isPending={isSubmitting}
        onConfirm={handleConfirm}
      />
    </form>
  );
}

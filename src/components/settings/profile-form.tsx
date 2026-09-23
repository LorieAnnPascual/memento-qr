'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ProfileFormProps {
  email: string;
  fullName: string | null;
}

export function ProfileForm({ email, fullName }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(fullName ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setShowConfirm(true);
  }

  async function handleConfirm(): Promise<void> {
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name }),
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      toast.success('Profile updated.');
      setShowConfirm(false);
      router.refresh();
    } catch (error) {
      toast.error('Failed to update profile. Please try again.');
      console.error('Update profile error:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save changes'}
      </Button>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Save profile changes?"
        description={`Your display name will be updated to "${name}".`}
        confirmLabel="Save changes"
        pendingLabel="Saving…"
        isPending={isSubmitting}
        onConfirm={handleConfirm}
      />
    </form>
  );
}

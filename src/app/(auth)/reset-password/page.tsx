'use client';

import { useRouter } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UpdatePasswordForm } from '@/components/auth/update-password-form';

export default function ResetPasswordPage() {
  const router = useRouter();

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm
          submitLabel="Set password"
          onSuccess={() => {
            router.push('/');
            router.refresh();
          }}
        />
      </CardContent>
    </Card>
  );
}

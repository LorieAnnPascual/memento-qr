import { Suspense } from 'react';
import Image from 'next/image';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="relative mb-2 h-16 w-16">
          <Image src="/logo.svg" alt="" fill className="object-contain" priority />
        </div>
        <CardTitle>Memento QR</CardTitle>
        <CardDescription>Sign in with your team account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}

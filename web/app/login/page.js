'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/AuthLayout';
import { Button, Field, Input, Callout } from '@/components/ui';
import { api } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api('/auth/login', { method: 'POST', body: form });
      router.replace(safeNext);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your FeatureTrack account" footer={<>New to FeatureTrack? <Link className="font-medium text-brand-500 hover:underline" href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="Email"><Input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Button type="submit" className="w-full" loading={loading} disabled={!form.email || !form.password}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

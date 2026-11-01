'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/AuthLayout';
import { Button, Field, Input, Callout } from '@/components/ui';
import { api } from '@/lib/api';
import { passwordIssues } from '@/lib/format';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const issues = passwordIssues(form.password);
  const next = params.get('next');

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (issues.length) return;
    setError(null);
    setLoading(true);
    try {
      await api('/auth/register', { method: 'POST', body: form });
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/onboarding');
    } catch (err) {
      setError(err.details?.map((d) => d.message).join('. ') || err.message);
      setLoading(false);
    }
  }
  return (
    <AuthLayout title="Create your account" subtitle="Start tracking product usage in minutes" footer={<>Already have an account? <Link className="font-medium text-brand-500 hover:underline" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="Full name"><Input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" /></Field>
        <Field label="Work email"><Input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" /></Field>
        <Field label="Password" error={touched && issues.length ? `Password needs ${issues.join(', ')}` : null} hint="10+ characters with upper & lower case letters and a number">
          <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} onBlur={() => setTouched(true)} />
        </Field>
        <Button type="submit" className="w-full" loading={loading} disabled={!form.name || !form.email || !form.password}>Create account</Button>
      </form>
    </AuthLayout>
  );
}

export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}

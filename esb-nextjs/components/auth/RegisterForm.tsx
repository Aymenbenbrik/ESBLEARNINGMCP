'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { authApi } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  is_teacher: z.boolean(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      is_teacher: false,
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      await authApi.register({
        username: data.username,
        email: data.email,
        password: data.password,
        is_teacher: data.is_teacher,
      });
      toast.success('Registration successful! Please login.');
      router.push('/login');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Registration failed';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-bolt-line rounded-[16px] shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-extrabold text-bolt-ink">
          Create an account
        </CardTitle>
        <CardDescription className="text-bolt-muted">
          Enter your details to register for ESB Platform
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="font-semibold text-bolt-ink">
              Username
            </Label>
            <Input
              id="username"
              {...register('username')}
              className="rounded-xl border-bolt-line focus:ring-bolt-accent/20"
              disabled={isLoading}
            />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="font-semibold text-bolt-ink">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              className="rounded-xl border-bolt-line focus:ring-bolt-accent/20"
              disabled={isLoading}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="font-semibold text-bolt-ink">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              {...register('password')}
              className="rounded-xl border-bolt-line focus:ring-bolt-accent/20"
              disabled={isLoading}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="font-semibold text-bolt-ink">
              Confirm Password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              {...register('confirmPassword')}
              className="rounded-xl border-bolt-line focus:ring-bolt-accent/20"
              disabled={isLoading}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role" className="font-semibold text-bolt-ink">
              Register as
            </Label>
            <select
              id="role"
              {...register('is_teacher', { setValueAs: (v) => v === 'true' })}
              className="w-full rounded-xl border border-bolt-line bg-bolt-surface px-3 py-2 text-bolt-ink focus:outline-none focus:ring-2 focus:ring-bolt-accent/20"
              disabled={isLoading}
            >
              <option value="false">Student</option>
              <option value="true">Teacher</option>
            </select>
          </div>

          <Button
            type="submit"
            className="w-full rounded-full bg-bolt-accent hover:bg-bolt-accent-600 text-white font-bold h-11"
            disabled={isLoading}
          >
            {isLoading ? 'Creating account...' : 'Create account'}
          </Button>

          <p className="text-center text-sm text-bolt-muted">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-bolt-accent hover:underline font-semibold"
            >
              Login
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

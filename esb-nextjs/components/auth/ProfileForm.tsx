'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { authApi } from '@/lib/api/auth';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const profileSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  google_api_key: z.string().optional(),
});

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export function ProfileForm() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: user?.username || '',
      email: user?.email || '',
      google_api_key: user?.google_api_key || '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors },
    reset: resetPasswordForm,
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const onProfileSubmit = async (data: ProfileFormData) => {
    setIsLoading(true);
    try {
      await authApi.updateProfile(data);
      toast.success('Profile updated successfully');
      // Reload to get updated user data
      window.location.reload();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to update profile';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    setIsPasswordLoading(true);
    try {
      await authApi.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      });
      toast.success('Password changed successfully');
      setPasswordDialogOpen(false);
      resetPasswordForm();
    } catch (error: any) {
      // Check if error is 422 (invalid JWT token)
      if (error.response?.status === 422) {
        toast.error('Your session is invalid. Please login again.');
        // Clear invalid JWT cookies
        document.cookie = 'access_token_cookie=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'refresh_token_cookie=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        // Redirect to login after a short delay
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        const errorMessage = error.response?.data?.error || 'Failed to change password';
        toast.error(errorMessage);
      }
    } finally {
      setIsPasswordLoading(false);
    }
  };

  if (!user) return null;

  const userInitials = user.username
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <div className="grid gap-6 md:grid-cols-[300px_1fr]">
      {/* User Info Card */}
      <Card className="border-bolt-line rounded-[16px] shadow-[0_8px_24px_rgba(15,23,42,0.08)] h-fit">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <Avatar className="h-[120px] w-[120px]">
              <AvatarFallback className="bg-bolt-accent text-white text-4xl font-bold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h3 className="font-extrabold text-xl text-bolt-ink">{user.username}</h3>
              <p className="text-sm text-bolt-muted">{user.email}</p>
              <div className="pt-2">
                <Badge
                  variant={user.is_teacher ? 'default' : 'secondary'}
                  className="rounded-full font-semibold"
                >
                  {user.is_teacher ? 'Teacher' : 'Student'}
                  {user.is_superuser && ' (Admin)'}
                </Badge>
              </div>
            </div>
            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full rounded-full border-bolt-line font-semibold"
                >
                  Change Password
                </Button>
              </DialogTrigger>
              <DialogContent className="border-bolt-line rounded-[16px]">
                <DialogHeader>
                  <DialogTitle className="font-extrabold">Change Password</DialogTitle>
                  <DialogDescription>
                    Enter your current password and a new password
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current_password" className="font-semibold">
                      Current Password
                    </Label>
                    <Input
                      id="current_password"
                      type="password"
                      {...registerPassword('current_password')}
                      className="rounded-xl border-bolt-line"
                      disabled={isPasswordLoading}
                    />
                    {passwordErrors.current_password && (
                      <p className="text-sm text-destructive">
                        {passwordErrors.current_password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_password" className="font-semibold">
                      New Password
                    </Label>
                    <Input
                      id="new_password"
                      type="password"
                      {...registerPassword('new_password')}
                      className="rounded-xl border-bolt-line"
                      disabled={isPasswordLoading}
                    />
                    {passwordErrors.new_password && (
                      <p className="text-sm text-destructive">
                        {passwordErrors.new_password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm_password" className="font-semibold">
                      Confirm New Password
                    </Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      {...registerPassword('confirm_password')}
                      className="rounded-xl border-bolt-line"
                      disabled={isPasswordLoading}
                    />
                    {passwordErrors.confirm_password && (
                      <p className="text-sm text-destructive">
                        {passwordErrors.confirm_password.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full rounded-full bg-bolt-accent hover:bg-bolt-accent-600 text-white font-bold"
                    disabled={isPasswordLoading}
                  >
                    {isPasswordLoading ? 'Changing...' : 'Change Password'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Profile Edit Form */}
      <Card className="border-bolt-line rounded-[16px] shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
        <CardHeader>
          <CardTitle className="font-extrabold text-2xl">Profile Settings</CardTitle>
          <CardDescription>Update your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onProfileSubmit)} className="space-y-4">
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

            {user.is_teacher && (
              <div className="space-y-2">
                <Label htmlFor="google_api_key" className="font-semibold text-bolt-ink">
                  Google API Key <span className="text-bolt-muted">(Optional)</span>
                </Label>
                <Input
                  id="google_api_key"
                  type="password"
                  {...register('google_api_key')}
                  className="rounded-xl border-bolt-line focus:ring-bolt-accent/20"
                  disabled={isLoading}
                  placeholder="Enter your Google API key"
                />
                {errors.google_api_key && (
                  <p className="text-sm text-destructive">{errors.google_api_key.message}</p>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="rounded-full bg-bolt-accent hover:bg-bolt-accent-600 text-white font-bold px-8"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

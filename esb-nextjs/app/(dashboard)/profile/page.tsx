import { ProfileForm } from '@/components/auth/ProfileForm';

export default function ProfilePage() {
  return (
    <div className="py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-bolt-ink tracking-tight">
          My Profile
        </h1>
        <p className="text-bolt-muted mt-1">
          Manage your account settings and preferences
        </p>
      </div>
      <ProfileForm />
    </div>
  );
}

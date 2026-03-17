'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { usersApi } from '@/lib/api/users';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus } from 'lucide-react';

interface BulkEmailImportProps {
  onSuccess: () => void;
}

export function BulkEmailImport({ onSuccess }: BulkEmailImportProps) {
  const [emails, setEmails] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailList = emails
      .split('\n')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    if (emailList.length === 0) {
      toast.error('Please enter at least one email address');
      return;
    }

    setIsLoading(true);
    try {
      const result = await usersApi.bulkAddStudents(emailList);

      let message = '';
      if (result.added.length > 0) {
        message += `${result.added.length} student(s) added successfully. `;
      }
      if (result.existing.length > 0) {
        message += `${result.existing.length} student(s) already exist. `;
      }
      if (result.errors.length > 0) {
        message += `${result.errors.length} error(s) occurred.`;
        toast.warning(message);
      } else {
        toast.success(message);
      }

      setEmails('');
      onSuccess();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to add students';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Textarea
          placeholder="student1@example.com&#10;student2@example.com&#10;student3@example.com"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          className="min-h-[200px] rounded-xl border-bolt-line focus:ring-bolt-accent/20 font-mono text-sm"
          disabled={isLoading}
        />
        <p className="text-sm text-bolt-muted">
          Paste student emails (one per line). Usernames will be auto-generated from email addresses.
          Default password: <code className="bg-bolt-surface px-1.5 py-0.5 rounded">FirstName@123</code>
        </p>
      </div>

      <Button
        type="submit"
        className="rounded-full bg-bolt-accent hover:bg-bolt-accent-600 text-white font-bold"
        disabled={isLoading}
      >
        <UserPlus className="h-4 w-4 mr-2" />
        {isLoading ? 'Adding Students...' : 'Add Students'}
      </Button>
    </form>
  );
}

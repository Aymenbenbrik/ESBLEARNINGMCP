'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CreateClassData } from '@/lib/types/admin';

const classSchema = z.object({
  name: z.string().min(1, 'Class name is required').max(150, 'Name must be at most 150 characters'),
});

interface CreateClassFormProps {
  onSubmit: (data: CreateClassData) => void;
  isLoading?: boolean;
}

export function CreateClassForm({ onSubmit, isLoading }: CreateClassFormProps) {
  const form = useForm<CreateClassData>({
    resolver: zodResolver(classSchema),
    defaultValues: {
      name: '',
    },
  });

  const handleSubmit = (data: CreateClassData) => {
    onSubmit(data);
    form.reset();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex gap-2 items-end">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Class Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., CS-101-A" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Class'}
        </Button>
      </form>
    </Form>
  );
}

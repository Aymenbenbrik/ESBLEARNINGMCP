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
import { Textarea } from '@/components/ui/textarea';
import { CreateProgramData } from '@/lib/types/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const programSchema = z.object({
  name: z.string().min(1, 'Program name is required').max(150, 'Name must be at most 150 characters'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
});

interface CreateProgramFormProps {
  onSubmit: (data: CreateProgramData) => void;
  isLoading?: boolean;
}

export function CreateProgramForm({ onSubmit, isLoading }: CreateProgramFormProps) {
  const form = useForm<CreateProgramData>({
    resolver: zodResolver(programSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const handleSubmit = (data: CreateProgramData) => {
    onSubmit(data);
    form.reset();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Program</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Program Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Computer Science" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Program description..."
                      className="resize-none min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Program'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

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
import { Chapter, CreateChapterData } from '@/lib/types/course';

const chapterSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be at most 100 characters'),
  order: z.number().int().min(1, 'Order must be at least 1'),
});

interface ChapterFormProps {
  initialData?: Chapter;
  onSubmit: (data: CreateChapterData) => void;
  isLoading?: boolean;
  defaultOrder?: number;
}

export function ChapterForm({ initialData, onSubmit, isLoading, defaultOrder = 1 }: ChapterFormProps) {
  const form = useForm<CreateChapterData>({
    resolver: zodResolver(chapterSchema),
    defaultValues: {
      title: initialData?.title || '',
      order: initialData?.order || defaultOrder,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Chapter 1: Introduction" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="order"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Order</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : initialData ? 'Update Chapter' : 'Create Chapter'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

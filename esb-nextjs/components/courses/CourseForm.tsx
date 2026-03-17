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
import { Course, CreateCourseData } from '@/lib/types/course';

const courseSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be at most 100 characters'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
});

interface CourseFormProps {
  initialData?: Course;
  onSubmit: (data: CreateCourseData) => void;
  isLoading?: boolean;
}

export function CourseForm({ initialData, onSubmit, isLoading }: CourseFormProps) {
  const form = useForm<CreateCourseData>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: initialData?.title || '',
      description: initialData?.description || '',
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
                <Input placeholder="Introduction to AI" {...field} />
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
                  placeholder="Course description..."
                  className="resize-none min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : initialData ? 'Update Course' : 'Create Course'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

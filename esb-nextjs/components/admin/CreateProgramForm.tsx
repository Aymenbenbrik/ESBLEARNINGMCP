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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CreateProgramData } from '@/lib/types/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const programSchema = z.object({
  name: z.string().min(1, 'Program name is required').max(150, 'Name must be at most 150 characters'),
  code: z.string().max(50, 'Code must be at most 50 characters').optional(),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  program_type: z.string().optional(),
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
      code: '',
      description: '',
      program_type: '',
    },
  });

  const handleSubmit = (data: CreateProgramData) => {
    onSubmit(data);
    form.reset();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer un programme</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom du programme</FormLabel>
                    <FormControl>
                      <Input placeholder="ex: Informatique" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="ex: LMA, MDS" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="program_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type (optionnel)</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner le type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Licence">Licence</SelectItem>
                        <SelectItem value="Master">Master</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optionnel)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Description du programme..."
                      className="resize-none min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Création...' : 'Créer le programme'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

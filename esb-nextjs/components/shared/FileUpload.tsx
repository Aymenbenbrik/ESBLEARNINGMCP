import { ChangeEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X } from 'lucide-react';

interface FileUploadProps {
  accept: string;
  onChange: (file: File | null) => void;
  value?: File | null;
  disabled?: boolean;
}

export function FileUpload({ accept, onChange, value, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFileName(file?.name || '');
    onChange(file);
  };

  const handleClear = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setFileName('');
    onChange(null);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const displayName = value?.name || fileName;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleClick}
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          Choose File
        </Button>

        {displayName && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm text-muted-foreground truncate">
              {displayName}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClear}
              disabled={disabled}
              className="h-8 w-8 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {!displayName && (
        <p className="text-xs text-muted-foreground">
          Accepted formats: {accept}
        </p>
      )}
    </div>
  );
}

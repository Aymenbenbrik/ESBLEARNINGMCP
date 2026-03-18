declare module 'react-katex' {
  import { FC } from 'react';
  export const InlineMath: FC<{ math: string; renderError?: (err: Error) => React.ReactNode }>;
  export const BlockMath: FC<{ math: string; renderError?: (err: Error) => React.ReactNode }>;
}

'use client';

import Exit from '@/exit/Exit';
import { Toaster } from '@/components/ui';
import { useRoute } from '@/lib/router';

export default function ExitPage() {
  const { path } = useRoute();
  return (
    <>
      <Exit path={path.startsWith('/exit') ? path : '/exit'} />
      <Toaster />
    </>
  );
}

'use client';

import Exit from '@/exit/Exit';
import { Toaster } from '@/components/ui';
import { useRoute } from '@/lib/router';
import { useParams } from 'next/navigation';

export default function ExitSlugPage() {
  const params = useParams();
  const slug = params?.slug;
  const path = Array.isArray(slug) ? `/exit/${slug.join('/')}` : '/exit';

  return (
    <>
      <Exit path={path} />
      <Toaster />
    </>
  );
}

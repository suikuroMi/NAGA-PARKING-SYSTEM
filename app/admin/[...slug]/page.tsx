'use client';

import Admin from '@/admin/Admin';
import { Toaster } from '@/components/ui';
import { useParams, useSearchParams } from 'next/navigation';

export default function AdminSlugPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug;
  const path = Array.isArray(slug) ? `/admin/${slug.join('/')}` : '/admin';

  return (
    <>
      <Admin path={path} params={new URLSearchParams(searchParams.toString())} />
      <Toaster />
    </>
  );
}

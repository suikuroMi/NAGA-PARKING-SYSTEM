'use client';

import Admin from '@/admin/Admin';
import { Toaster } from '@/components/ui';
import { useRoute } from '@/lib/router';

export default function AdminPage() {
  const { path, params } = useRoute();
  return (
    <>
      <Admin path={path.startsWith('/admin') ? path : '/admin'} params={params} />
      <Toaster />
    </>
  );
}

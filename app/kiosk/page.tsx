'use client';

import Kiosk from '@/kiosk/Kiosk';
import { Toaster } from '@/components/ui';

export default function KioskPage() {
  return (
    <>
      <Kiosk />
      <Toaster />
    </>
  );
}

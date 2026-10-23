// components/CameraScanner.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface CameraScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (ticketId: string) => void;
}

export default function CameraScanner({ open, onClose, onScan }: CameraScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    let isMounted = true;

    async function startCamera() {
      setError(null);
      setScanning(true);
      try {
        const scanner = new Html5Qrcode('qr-reader-container');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            if (isMounted) {
              await stopCamera();
              onScan(decodedText);
              onClose();
            }
          },
          () => {}
        );
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to start camera. Please ensure camera permissions are granted.');
          setScanning(false);
        }
      }
    }

    const timer = setTimeout(startCamera, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopCamera();
    };
  }, [open]);

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        // ignore stop error on unmount
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <Camera className="size-5 text-brand" />
            <span>Scan Ticket QR Code</span>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center">
          <div
            id="qr-reader-container"
            className="w-full overflow-hidden rounded-xl border border-line bg-black min-h-[260px]"
          />

          {error && (
            <div className="mt-4 w-full rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
              <p className="font-semibold">Camera Error:</p>
              <p>{error}</p>
            </div>
          )}

          <p className="mt-4 text-center text-xs text-muted">
            Point your camera at the QR code printed on the parking ticket.
          </p>
        </div>
      </div>
    </div>
  );
}

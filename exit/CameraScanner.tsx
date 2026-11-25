import { useEffect, useRef } from 'react'
import QrScanner from 'qr-scanner'

export type CameraError = 'denied' | 'nocamera' | 'unsupported'

function classify(err: unknown): CameraError {
  const text = `${(err as { name?: string })?.name ?? ''} ${String(err)}`
  if (/NotAllowed|Permission|denied|Security/i.test(text)) return 'denied'
  if (/NotFound|not found|Overconstrained|NotReadable/i.test(text)) return 'nocamera'
  return 'unsupported'
}

async function cameraDenied() {
  try {
    return (await navigator.permissions.query({ name: 'camera' as PermissionName })).state === 'denied'
  } catch {
    return false
  }
}

/**
 * Live camera QR reader. Mount it to start the camera and unmount it to stop.
 * Reports the first decoded value once, then stops scanning to avoid double scans.
 */
export default function CameraScanner({ onResult, onError, onReady }: { onResult: (text: string) => void; onError: (kind: CameraError) => void; onReady?: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const cbs = useRef({ onResult, onError, onReady })
  cbs.current = { onResult, onError, onReady }

  useEffect(() => {
    const el = video.current
    if (!el || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      cbs.current.onError('unsupported')
      return
    }
    let cancelled = false
    let decoded = false
    const scanner = new QrScanner(
      el,
      (r) => {
        if (decoded || cancelled) return
        decoded = true
        scanner.stop()
        cbs.current.onResult(r.data)
      },
      { preferredCamera: 'environment', maxScansPerSecond: 8, returnDetailedScanResult: true, highlightScanRegion: false, highlightCodeOutline: false },
    )
    cameraDenied()
      .then(async (denied) => {
        if (cancelled) return
        if (denied) throw new DOMException('Camera permission denied', 'NotAllowedError')
        const has = await QrScanner.hasCamera()
        if (cancelled) return
        if (!has) throw new Error('NotFoundError')
        return scanner.start().then(() => {
          if (!cancelled) cbs.current.onReady?.()
        })
      })
      .catch(async (err) => {
        // qr-scanner can replace a denied getUserMedia error with "Camera not found".
        const denied = await cameraDenied()
        if (!cancelled) cbs.current.onError(denied ? 'denied' : classify(err))
      })
    return () => {
      cancelled = true
      scanner.destroy()
    }
  }, [])

  return <video ref={video} className="absolute inset-0 h-full w-full object-cover" muted playsInline aria-label="Camera preview" />
}

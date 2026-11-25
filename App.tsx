'use client'

import dynamic from 'next/dynamic'

const ParkingApp = dynamic(() => import('./ParkingApp'), {
  ssr: false,
  loading: () => <p className="p-8 text-muted">Loading parking system…</p>,
})

export default function App() {
  return <ParkingApp />
}

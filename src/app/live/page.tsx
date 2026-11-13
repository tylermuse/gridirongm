import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LiveExhibition } from './LiveExhibition';

const BASE_URL = 'https://bs-football.com';

export const metadata: Metadata = {
  title: 'Watch Your Football GM League in 3D: Free, No Install | BS Football',
  description:
    'Upload your Football GM league file and watch any two teams play a full game live in 3D, right in your browser. Free, no download, no account.',
  alternates: { canonical: `${BASE_URL}/live` },
  openGraph: {
    title: 'Watch your Football GM league in live 3D',
    description: 'Upload your Football GM export, pick two teams, and watch them play every snap in 3D. Free, in your browser.',
    url: `${BASE_URL}/live`,
  },
};

export default function LivePage() {
  return (
    <Suspense>
      <LiveExhibition />
    </Suspense>
  );
}

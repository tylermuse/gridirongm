'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Redirect old /schedule route to the combined standings page */
export default function ScheduleRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/standings');
  }, [router]);
  return null;
}

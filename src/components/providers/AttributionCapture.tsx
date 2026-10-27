'use client';

import { useEffect } from 'react';
import { captureFirstTouch } from '@/lib/attribution';

/** Records first-touch acquisition data once per browser. Renders nothing. */
export function AttributionCapture() {
  useEffect(() => {
    captureFirstTouch();
  }, []);
  return null;
}

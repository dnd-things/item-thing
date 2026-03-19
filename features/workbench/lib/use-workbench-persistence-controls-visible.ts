'use client';

import { useEffect, useState } from 'react';

export function useWorkbenchPersistenceControlsVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    setVisible(host === 'localhost' || host === '127.0.0.1');
  }, []);

  return visible;
}

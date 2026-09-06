import React from 'react';
import { createRoot } from 'react-dom/client';
import ClinicApp from './ClinicApp';

const mount = document.getElementById('root');
if (mount) createRoot(mount).render(<ClinicApp />);

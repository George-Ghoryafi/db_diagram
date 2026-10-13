import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import { datadogRum } from '@datadog/browser-rum';
import { reactPlugin } from '@datadog/browser-rum-react';
import { version } from '../package.json';
import '@xyflow/react/dist/style.css';
import './style.css';

datadogRum.init({
  applicationId: '60da389d-fa91-4e9c-ad6f-13f73aed8048',
  clientToken: 'pubf0f0cca7b9232a7edacbb5998d51cd5d',
  site: 'datadoghq.com',
  service: 'schemadb',
  env: import.meta.env.PROD ? 'prod' : 'dev',
  version,
  sessionSampleRate: 100,
  sessionReplaySampleRate: 20,
  trackResources: true,
  trackUserInteractions: true,
  trackLongTasks: true,
  // Keep schema text and sample records out of session recordings.
  defaultPrivacyLevel: 'mask',
  plugins: [reactPlugin({ router: false })],
});

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

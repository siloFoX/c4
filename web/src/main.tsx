import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider } from './hooks/use-confirm';
import { installErrorCapture } from './lib/error-capture';
import './index.css';
import './styles/print.css';
import './styles/safe-area.css';

installErrorCapture();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

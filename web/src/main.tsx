import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installAuthFetch } from './lib/auth';
import './index.css';

// 10.1: install global fetch wrapper before any component mounts so every
// API call carries the bearer token if one is present in localStorage.
installAuthFetch();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import InternalApp from './InternalApp';
import './styles/global.css';
import './input-mode';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <InternalApp />
  </React.StrictMode>
);

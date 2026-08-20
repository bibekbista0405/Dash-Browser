import React from 'react';
import ReactDOM from 'react-dom/client';
import InternalApp from './InternalApp';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <InternalApp />
  </React.StrictMode>
);

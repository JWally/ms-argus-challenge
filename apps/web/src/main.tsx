import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { EmbedPage } from './pages/EmbedPage.js';
import { HomePage } from './pages/HomePage.js';
import { MerchantPage } from './pages/MerchantPage.js';
import { MobileSsoPage } from './pages/MobileSsoPage.js';
import { PairTokenPage } from './pages/PairTokenPage.js';
import { PhonePage } from './pages/PhonePage.js';
import { SsoChallengePage } from './pages/SsoChallengePage.js';
import { SsoValidatePage } from './pages/SsoValidatePage.js';
import './styles.css';

const root = document.querySelector('#root');
if (!root) throw new Error('root_element_missing');

createRoot(root).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/embed" element={<EmbedPage />} />
      <Route path="/p/:token" element={<PairTokenPage />} />
      <Route path="/pair/:sessionId" element={<PhonePage />} />
      <Route path="/sso/mobile" element={<MobileSsoPage />} />
      <Route path="/sso/challenge/:sessionId" element={<SsoChallengePage />} />
      <Route path="/merchant/validate" element={<SsoValidatePage />} />
      <Route path="/merchant" element={<MerchantPage />} />
    </Routes>
  </BrowserRouter>
);

import { FC, ReactNode } from 'react';
import { Navbar } from '@components/layout/Navbar';
import { Footer } from '@pages/home/components/Footer';

export const Layout: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-dark-base overflow-x-clip" data-component="LayoutRoot">
      {/* Glassmorphism Navbar - appears when hero is 98% out of view */}
      <Navbar />

      {/* Main content - no padding-top since hero is full-screen */}
      <main data-slot="main-content">
        {children}
      </main>

      {/* Footer - included in all public routes */}
      <Footer />
    </div>
  );
};

export default Layout;

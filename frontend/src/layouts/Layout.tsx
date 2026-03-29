import { FC, ReactNode } from 'react';
import { Navbar } from '@components/layout/Navbar';

export const Layout: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-dark-base overflow-x-hidden">
      {/* Glassmorphism Navbar - appears when hero is 98% out of view */}
      <Navbar />
      
      {/* Main content - no padding-top since hero is full-screen */}
      <main>
        {children}
      </main>
    </div>
  );
};

export default Layout;

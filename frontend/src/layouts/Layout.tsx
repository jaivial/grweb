import { FC, ReactNode } from 'react';
import { Navbar } from '@components/layout/Navbar';
import { Footer } from '@pages/home/components/Footer';

export const Layout: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-dark-base overflow-x-clip" data-ui="layout-root">
      <Navbar />

      <main data-ui="layout-main-content">
        {children}
      </main>

      <Footer />
    </div>
  );
};

export default Layout;

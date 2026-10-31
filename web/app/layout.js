import './globals.css';
import { Providers } from './providers';
import { themeScript } from '@/lib/theme';

export const metadata = {
  title: { default: 'FeatureTrack', template: '%s · FeatureTrack' },
  description: 'Product analytics, event tracking and feature adoption for engineering and product teams.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

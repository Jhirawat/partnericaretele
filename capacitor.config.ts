import type { CapacitorConfig } from '@capacitor/cli';

// The app depends on TanStack Start server functions (src/lib/*.functions.ts),
// which need a running server. A static bundle inside the APK cannot serve them
// and renders a blank white screen, so the APK loads the live deployment.
const config: CapacitorConfig = {
  appId: 'com.thaikanya.icaretele',
  appName: 'iCareTele',
  webDir: '.output/public',
  server: {
    url: 'https://partnericaretele.lovable.app',
    cleartext: false,
  },
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shadowtasks.app',
  appName: 'Shadow Tasks',
  webDir: 'dist',
  backgroundColor: '#04070d',
  android: {
    backgroundColor: '#04070d',
  },
  // Backend runs on plain HTTP for local LAN dev — serving the app itself over
  // https://localhost (Capacitor's default) makes every fetch to that backend a
  // mixed-content violation the WebView blocks outright, regardless of the
  // usesCleartextTraffic manifest flag. Matching scheme avoids that entirely.
  server: {
    androidScheme: 'http',
  },
};

export default config;

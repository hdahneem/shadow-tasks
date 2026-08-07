import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

export async function setupNativeChrome() {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false });
    // dark app background -> light (white) status bar icons/text
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#04070d' });
  } catch {
    // status bar plugin unavailable (e.g. running in browser) — ignore
  }
}

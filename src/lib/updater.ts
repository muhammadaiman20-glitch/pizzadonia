import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/**
 * Plugin native Android (`AppUpdaterPlugin.java`) yang memuat turun APK
 * kemas kini dan membuka pemasang sistem. Hanya tersedia dalam app Android.
 */
export interface UpdateProgress {
  downloaded?: number
  total?: number
  percent?: number
}

export type NativeInstallStatus = 'installer_opened' | 'permission_required'

export interface NativeInstallResult {
  status: NativeInstallStatus
}

interface AppUpdaterPlugin {
  downloadAndInstall(options: { url: string; versionName?: string }): Promise<NativeInstallResult>
  openInstallSettings(): Promise<void>
  addListener(
    eventName: 'progress',
    listenerFunc: (progress: UpdateProgress) => void,
  ): Promise<PluginListenerHandle>
}

export const updaterPlugin = registerPlugin<AppUpdaterPlugin>('AppUpdater')

/** Pastikan app berjalan secara native dan plugin wujud sebelum dipanggil. */
export function nativeUpdaterAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AppUpdater')
}

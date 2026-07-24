export interface StorageUsageDetails {
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
  percentUsed: number;

  // LocalStorage specific
  lsUsedBytes: number;
  lsQuotaBytes: number;
  lsAvailableBytes: number;
  lsPercentUsed: number;

  // Category breakdown
  logsBytes: number;
  attendanceBytes: number;
  settingsAndBrandingBytes: number;
  profilesAndTimetableBytes: number;

  formattedUsed: string;
  formattedAvailable: string;
  formattedQuota: string;
}

export function formatByteSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export async function getStorageUsageInfo(): Promise<StorageUsageDetails> {
  let usedBytes = 0;
  let quotaBytes = 5 * 1024 * 1024; // Default fallback: 5MB

  // 1. Try Navigator Storage Estimate API
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      if (estimate.usage !== undefined) usedBytes = estimate.usage;
      if (estimate.quota !== undefined && estimate.quota > 0) quotaBytes = estimate.quota;
    } catch (e) {
      console.warn('Storage estimate error:', e);
    }
  }

  // 2. Measure localStorage exact footprint
  let lsUsedBytes = 0;
  let logsBytes = 0;
  let attendanceBytes = 0;
  let settingsAndBrandingBytes = 0;
  let profilesAndTimetableBytes = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        const keySize = (key.length + value.length) * 2; // UTF-16 characters = ~2 bytes each
        lsUsedBytes += keySize;

        if (key.startsWith('logs-') || key.startsWith('subs-')) {
          logsBytes += keySize;
        } else if (key.includes('attendance')) {
          attendanceBytes += keySize;
        } else if (key.includes('logo') || key.includes('pin') || key.includes('settings')) {
          settingsAndBrandingBytes += keySize;
        } else {
          profilesAndTimetableBytes += keySize;
        }
      }
    }
  } catch (e) {
    console.warn('LocalStorage scan error:', e);
  }

  // If navigator.storage provided 0 or was smaller than localStorage estimate
  if (usedBytes < lsUsedBytes) {
    usedBytes = lsUsedBytes;
  }

  const lsQuotaBytes = 5 * 1024 * 1024; // Standard LocalStorage quota is ~5MB per domain
  const lsAvailableBytes = Math.max(0, lsQuotaBytes - lsUsedBytes);
  const lsPercentUsed = Math.min(100, Math.round((lsUsedBytes / lsQuotaBytes) * 1000) / 10);

  const availableBytes = Math.max(0, quotaBytes - usedBytes);
  const percentUsed = Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10);

  return {
    usedBytes,
    quotaBytes,
    availableBytes,
    percentUsed,

    lsUsedBytes,
    lsQuotaBytes,
    lsAvailableBytes,
    lsPercentUsed,

    logsBytes,
    attendanceBytes,
    settingsAndBrandingBytes,
    profilesAndTimetableBytes,

    formattedUsed: formatByteSize(usedBytes),
    formattedAvailable: formatByteSize(availableBytes),
    formattedQuota: formatByteSize(quotaBytes),
  };
}

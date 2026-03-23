let logger: ((message: string) => void) | null = null;

export function logDebug(message: string) {
  logger?.(message);
}

export function setDebugLogger(next: ((message: string) => void) | null) {
  logger = next;
}


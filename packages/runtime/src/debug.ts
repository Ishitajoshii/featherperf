export interface RuntimeLogger {
  log(message: string): void;
}

export function createRuntimeLogger(enabled: boolean | undefined, label: string): RuntimeLogger {
  const normalizedLabel = label.trim() || 'deferred-module';

  return {
    log(message: string) {
      if (!enabled) {
        return;
      }

      console.debug(`[FeatherPerf] ${normalizedLabel}: ${message}`);
    }
  };
}

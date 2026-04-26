export interface FeatherPerfOptions {
  debug?: boolean;
  idleTimeoutMs?: number;
  lookaheadPx?: number;
}

export type SupportedHeavyPackage = 'gsap' | 'ScrollTrigger' | 'lottie-web';

export interface ImportBinding {
  importedName: string;
  localName: string;
  kind: 'default' | 'named' | 'namespace';
}

export interface DetectedImport {
  source: string;
  bindings: ImportBinding[];
  supportedPackage: SupportedHeavyPackage | null;
}

export interface ModuleDetectionResult {
  supportedPackages: SupportedHeavyPackage[];
  imports: DetectedImport[];
  hasSupportedImports: boolean;
}

export interface HeavyImportReportEntry {
  filePath: string;
  packages: SupportedHeavyPackage[];
}

export interface SafetyCheckResult {
  isClientModule: boolean;
  isSafeToDefer: boolean;
  reasons: string[];
}

export interface DeferredImportCandidate {
  importLineIndex: number;
  source: string;
  binding: ImportBinding;
}

export interface FeatherPerfOptions {
  debug?: boolean;
  idleTimeoutMs?: number;
  lookaheadPx?: number;
  include?: Array<string | RegExp>;
  exclude?: Array<string | RegExp>;
  criticalSelectors?: string[];
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

export interface SafetyCheckContext {
  importerId: string;
  triggerArgument: string | null;
  criticalSelectors?: string[];
}

export interface SafetyCheckResult {
  isClientModule: boolean;
  isSafeToDefer: boolean;
  reasons: string[];
}

export interface DeferredImportCandidate {
  source: string;
  binding: ImportBinding;
  importBindingCount: number;
  importStart: number;
  importEnd: number;
  callStart: number;
  callEnd: number;
  callArguments: string;
  triggerArgument: string | null;
  callIndent: string;
}

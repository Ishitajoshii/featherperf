export interface FeatherPerfAssetOptions {
  enabled?: boolean;
  criticalSelectors?: string[];
  waitForCriticalImages?: boolean;
  waitForFonts?: boolean;
  revealWhenReady?: boolean;
  includeViewportImages?: boolean;
  viewportMarginPx?: number;
  maxCriticalWaitMs?: number;
  loadingClass?: string;
  readyClass?: string;
}

export interface FeatherPerfOptions {
  debug?: boolean;
  idleTimeoutMs?: number;
  lookaheadPx?: number;
  postLoadDelayMs?: number;
  interactionQuietWindowMs?: number;
  include?: Array<string | RegExp>;
  exclude?: Array<string | RegExp>;
  criticalSelectors?: string[];
  assets?: boolean | FeatherPerfAssetOptions;
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
  importBindings: ImportBinding[];
  importBindingCount: number;
  importStart: number;
  importEnd: number;
  callStart: number;
  callEnd: number;
  callExpressionText: string;
  callArguments: string;
  triggerArgument: string | null;
  callIndent: string;
}

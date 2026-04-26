import path from 'node:path';
import { scanHeavyImportReport } from './detector.js';

function getInvocationDirectory(): string {
  return process.env.INIT_CWD ?? process.cwd();
}

function normalizeTargetDirectory(args: string[]): string {
  const targetArgument = args.find((argument) => argument !== '--');
  const invocationDirectory = getInvocationDirectory();

  if (!targetArgument) {
    return invocationDirectory;
  }

  return path.resolve(invocationDirectory, targetArgument);
}

async function main(): Promise<void> {
  const targetDirectory = normalizeTargetDirectory(process.argv.slice(2));
  const report = await scanHeavyImportReport(targetDirectory);

  if (report.length === 0) {
    console.log(`found no gsap, ScrollTrigger, or lottie-web imports in ${targetDirectory}`);
    return;
  }

  for (const entry of report) {
    const relativeFilePath = path.relative(targetDirectory, entry.filePath) || path.basename(entry.filePath);

    for (const supportedPackage of entry.packages) {
      console.log(`found ${supportedPackage} in ${relativeFilePath}`);
    }
  }

  console.log(`report complete (${report.length} file${report.length === 1 ? '' : 's'})`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`featherperf report failed: ${message}`);
  process.exitCode = 1;
});

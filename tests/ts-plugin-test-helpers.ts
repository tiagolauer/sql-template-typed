import ts from 'typescript';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const PLUGIN_DIR = join(REPO_ROOT, 'src', 'ts-plugin');

const PLUGIN_MODULES = [
  'index.cts',
  'sql-context.cts',
  'schema.cts',
  'detect.cts',
  'diagnostics.cts',
];

export type PluginFactory = (modules: { typescript: typeof ts }) => {
  create(info: unknown): ts.LanguageService;
};

function transpilePluginModules(): string {
  const dir = mkdtempSync(join(tmpdir(), 'owlsql-ts-plugin-build-'));

  for (const moduleName of PLUGIN_MODULES) {
    const source = readFileSync(join(PLUGIN_DIR, moduleName), 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: moduleName,
    }).outputText;
    writeFileSync(join(dir, moduleName.replace('.cts', '.cjs')), output);
  }

  return dir;
}

export function loadPlugin(): { plugin: PluginFactory; dir: string } {
  const dir = transpilePluginModules();
  const requireCompiled = createRequire(import.meta.url);
  return { plugin: requireCompiled(join(dir, 'index.cjs')) as PluginFactory, dir };
}

export type DiagnosticsModule = typeof import('../src/ts-plugin/diagnostics.cts');

export function loadDiagnostics(): { diagnostics: DiagnosticsModule; dir: string } {
  const dir = transpilePluginModules();
  const requireCompiled = createRequire(import.meta.url);
  return { diagnostics: requireCompiled(join(dir, 'diagnostics.cjs')) as DiagnosticsModule, dir };
}

export function buildLanguageService(
  source: string,
  fixturePrefix: string,
): { languageService: ts.LanguageService; filePath: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), fixturePrefix));
  const filePath = join(dir, 'fixture.ts');
  writeFileSync(filePath, source, 'utf8');

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    baseUrl: REPO_ROOT,
    paths: { '@owlsql/core': ['src/index.ts'] },
  };

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [filePath],
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => {
      const contents = ts.sys.readFile(name);
      return contents === undefined ? undefined : ts.ScriptSnapshot.fromString(contents);
    },
    getCurrentDirectory: () => REPO_ROOT,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
  };

  return { languageService: ts.createLanguageService(host), filePath, dir };
}

export interface BuiltProgram {
  program: ts.Program;
  sourceFile: ts.SourceFile;
  filePath: string;
  dir: string;
}

export function buildProgram(source: string, fixturePrefix: string): BuiltProgram {
  const dir = mkdtempSync(join(tmpdir(), fixturePrefix));
  const filePath = join(dir, 'fixture.ts');
  writeFileSync(filePath, source, 'utf8');

  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    baseUrl: REPO_ROOT,
    paths: { '@owlsql/core': ['src/index.ts'] },
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error('fixture source file was not found in the program');
  }

  return { program, sourceFile, filePath, dir };
}

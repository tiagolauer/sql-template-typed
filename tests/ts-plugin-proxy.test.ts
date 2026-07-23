import { afterAll, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import ts from 'typescript';
import { buildProgram, loadPlugin } from './ts-plugin-test-helpers.js';

const { plugin, dir: transpileDir } = loadPlugin();

const DIAGNOSTICS_FIXTURE = `
import type { TypedDb } from '@owlsql/core';

interface DB {
  users: { id: number; name: string };
}

declare const db: TypedDb<DB>;

db.query(\`select id from users\`);
`;

// Built once at module scope so the cost of ts.createProgram + the initial
// getTypeChecker() (which loads lib.d.ts) is paid outside any individual
// test's timeout budget, mirroring how loadPlugin() runs here.
const diagnosticsBuild = buildProgram(DIAGNOSTICS_FIXTURE, 'owlsql-ts-plugin-proxy-');
diagnosticsBuild.program.getTypeChecker();

afterAll(() => {
  rmSync(transpileDir, { recursive: true, force: true });
  rmSync(diagnosticsBuild.dir, { recursive: true, force: true });
});

const NATIVE_COMPLETIONS = {
  isGlobalCompletion: true,
  isMemberCompletion: false,
  isNewIdentifierLocation: false,
  entries: [{ name: 'nativeEntry', kind: ts.ScriptElementKind.unknown, sortText: '1' }],
};

const NATIVE_QUICK_INFO = {
  kind: ts.ScriptElementKind.unknown,
  kindModifiers: '',
  textSpan: { start: 0, length: 0 },
};

const NATIVE_DIAGNOSTICS: ts.Diagnostic[] = [];

function createProxy(languageServiceOverrides: Record<string, unknown>): ts.LanguageService {
  const languageService = {
    getCompletionsAtPosition: vi.fn().mockReturnValue(NATIVE_COMPLETIONS),
    getQuickInfoAtPosition: vi.fn().mockReturnValue(NATIVE_QUICK_INFO),
    getSemanticDiagnostics: vi.fn().mockReturnValue(NATIVE_DIAGNOSTICS),
    getProgram: vi.fn().mockReturnValue(undefined),
    ...languageServiceOverrides,
  };

  return plugin({ typescript: ts }).create({ languageService });
}

describe('ts-plugin proxy error handling', () => {
  it('falls back to native completions when the plugin path throws', () => {
    const getProgram = vi.fn(() => {
      throw new Error('checker exploded');
    });
    const proxy = createProxy({ getProgram });

    const result = proxy.getCompletionsAtPosition('file.ts', 10, undefined);

    expect(result).toBe(NATIVE_COMPLETIONS);
    expect(getProgram).toHaveBeenCalled();
  });

  it('falls back to native hover when the plugin path throws', () => {
    const getProgram = vi.fn(() => {
      throw new Error('checker exploded');
    });
    const proxy = createProxy({ getProgram });

    const result = proxy.getQuickInfoAtPosition('file.ts', 10);

    expect(result).toBe(NATIVE_QUICK_INFO);
  });

  it('computes native completions only once per request', () => {
    const getCompletionsAtPosition = vi.fn().mockReturnValue(NATIVE_COMPLETIONS);
    const proxy = createProxy({ getCompletionsAtPosition });

    proxy.getCompletionsAtPosition('file.ts', 10, undefined);

    expect(getCompletionsAtPosition).toHaveBeenCalledTimes(1);
  });

  it('returns native results when there is no program', () => {
    const proxy = createProxy({});

    expect(proxy.getCompletionsAtPosition('file.ts', 10, undefined)).toBe(NATIVE_COMPLETIONS);
    expect(proxy.getQuickInfoAtPosition('file.ts', 10)).toBe(NATIVE_QUICK_INFO);
  });

  it('falls back to native diagnostics when the plugin path throws', () => {
    const getProgram = vi.fn(() => {
      throw new Error('checker exploded');
    });
    const getSemanticDiagnostics = vi.fn().mockReturnValue(NATIVE_DIAGNOSTICS);
    const proxy = createProxy({ getProgram, getSemanticDiagnostics });

    const result = proxy.getSemanticDiagnostics('file.ts');

    expect(result).toBe(NATIVE_DIAGNOSTICS);
    expect(getProgram).toHaveBeenCalled();
  });

  it('computes native diagnostics lazily, only after the plugin path has run', () => {
    // Drive the NORMAL plugin path (valid program + source file) so the plugin
    // reaches query-literal scanning before resolving native diagnostics —
    // rather than short-circuiting through the no-program early return.
    const realProgram = diagnosticsBuild.program;
    const calls: string[] = [];
    const program = {
      getSourceFile: (name: string) => realProgram.getSourceFile(name),
      // getTypeChecker is the entry point into the plugin's query-literal
      // scanning; recording it proves native diagnostics resolve AFTER the
      // plugin has begun inspecting the program, not before.
      getTypeChecker: () => {
        calls.push('getTypeChecker');
        return realProgram.getTypeChecker();
      },
    } as unknown as ts.Program;
    const getProgram = vi.fn(() => {
      calls.push('getProgram');
      return program;
    });
    const getSemanticDiagnostics = vi.fn(() => {
      calls.push('getSemanticDiagnostics');
      return NATIVE_DIAGNOSTICS;
    });
    const proxy = createProxy({ getProgram, getSemanticDiagnostics });

    const result = proxy.getSemanticDiagnostics(diagnosticsBuild.filePath);

    expect(result).toBe(NATIVE_DIAGNOSTICS);
    // The native diagnostics must be resolved inside the try block AFTER the
    // plugin has scanned the program (getTypeChecker → query-literal scan),
    // never eagerly before it — an eager call lets an underlying throw escape
    // the proxy, and evaluating it before the scan wastes work on every call.
    expect(calls).toEqual(['getProgram', 'getTypeChecker', 'getSemanticDiagnostics']);
  });
});

import { afterAll, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import ts from 'typescript';
import { loadPlugin } from './ts-plugin-test-helpers.js';

const { plugin, dir: transpileDir } = loadPlugin();

afterAll(() => {
  rmSync(transpileDir, { recursive: true, force: true });
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

function createProxy(languageServiceOverrides: Record<string, unknown>): ts.LanguageService {
  const languageService = {
    getCompletionsAtPosition: vi.fn().mockReturnValue(NATIVE_COMPLETIONS),
    getQuickInfoAtPosition: vi.fn().mockReturnValue(NATIVE_QUICK_INFO),
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
});

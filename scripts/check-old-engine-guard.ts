/**
 * Проверка, что скрипт проверки движка написан на ES5 (issue #223). Запуск — `make old-engine-guard`.
 *
 * Скрипт — строка, сборщик его не транспилирует, и выполниться он обязан на движке, который
 * не понимает остальное приложение. Поэтому проверяется сам текст, каким он уйдёт в страницу.
 *
 * Проверок три:
 *
 *   1. `esbuild --target=es5` проходит без ошибок. Так ловятся `let`/`const`, деструктуризация,
 *      `for…of`, классы — то, что esbuild в ES5 переписать не умеет.
 *   2. Вывод для ES5 совпадает с выводом для `esnext`. Стрелки, шаблонные строки, `?.` и `??`
 *      esbuild не отвергает, а молча переписывает — и совпадение показывает, что переписывать
 *      было нечего.
 *   3. В тексте нет вызовов, которых у старого движка может не быть: синтаксисом они не являются,
 *      и esbuild о них не знает.
 */
import { transformSync } from 'esbuild';

import { OLD_ENGINE_FORCE_ALLOWED_SCRIPT, OLD_ENGINE_GUARD_SCRIPT } from '../app/utils/oldEngineGuard';

/** Вызовы новее ES5 — те, что перечислены в issue, и их ближайшие соседи. */
const FORBIDDEN_CALLS: { name: string; pattern: RegExp }[] = [
  { name: 'fetch', pattern: /\bfetch\s*\(/ },
  { name: 'Promise', pattern: /\bPromise\b/ },
  { name: 'forEach', pattern: /\.forEach\s*\(/ },
  { name: 'classList', pattern: /\.classList\b/ },
  { name: 'includes', pattern: /\.includes\s*\(/ },
  { name: 'startsWith', pattern: /\.startsWith\s*\(/ },
  { name: 'closest', pattern: /\.closest\s*\(/ },
  { name: 'Array.from', pattern: /\bArray\.from\b/ },
  { name: 'Object.assign', pattern: /\bObject\.assign\b/ },
];

/**
 * `{ engineOk: engineOk }` — законный ES5, но для `esnext` esbuild печатает его короткой записью
 * `{ engineOk }`. Это различие печати, а не переписанный синтаксис, и оно снимается до сравнения.
 */
const normalizeShorthand = (output: string): string =>
  output.replace(/^(\s*)([A-Za-z_$][\w$]*): \2(,?)$/gm, '$1$2$3');

const checkScript = (name: string, code: string): string[] => {
  const problems: string[] = [];
  let es5Output: string;

  try {
    es5Output = transformSync(code, { loader: 'js', target: 'es5' }).code;
  } catch (error) {
    return [`${name}: esbuild --target=es5 — ошибка\n${String(error)}`];
  }

  const esnextOutput = transformSync(code, { loader: 'js', target: 'esnext' }).code;

  if (normalizeShorthand(es5Output) !== esnextOutput) {
    const es5Lines = normalizeShorthand(es5Output).split('\n');
    const esnextLines = esnextOutput.split('\n');
    const firstDifference = esnextLines.findIndex((line, index) => line !== es5Lines[index]);

    problems.push(
      `${name}: esbuild переписал синтаксис под ES5, строка ${firstDifference + 1}:\n`
        + `  было:  ${esnextLines[firstDifference] ?? ''}\n`
        + `  стало: ${es5Lines[firstDifference] ?? ''}`,
    );
  }

  for (const forbidden of FORBIDDEN_CALLS) {
    if (forbidden.pattern.test(code)) {
      problems.push(`${name}: вызов ${forbidden.name} — у старого движка его может не быть`);
    }
  }

  return problems;
};

const scripts: [string, string][] = [
  ['OLD_ENGINE_GUARD_SCRIPT', OLD_ENGINE_GUARD_SCRIPT],
  ['OLD_ENGINE_FORCE_ALLOWED_SCRIPT', OLD_ENGINE_FORCE_ALLOWED_SCRIPT],
];

const problems = scripts.flatMap(([name, code]) => checkScript(name, code));

for (const [name, code] of scripts) {
  console.log(`${name}: ${Buffer.byteLength(code)} байт`);
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }

  process.exit(1);
}

console.log('esbuild --target=es5: без ошибок');
console.log('вывод es5 совпадает с esnext: синтаксис переписывать не пришлось');
console.log(`запрещённых вызовов нет: ${FORBIDDEN_CALLS.map((forbidden) => forbidden.name).join(', ')}`);

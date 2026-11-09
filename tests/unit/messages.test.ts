import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";

/** Les trois langues doivent rester synchronisées : clés, syntaxe ICU, variables. */

const root = path.resolve(__dirname, "..", "..");
const CATALOGS = ["common", "landing", "auth", "workspace", "brand", "content"];
const LOCALES = ["fr", "en", "ar"] as const;

type Tree = { [key: string]: string | Tree };

function load(locale: string, catalog: string): Tree {
  return JSON.parse(readFileSync(path.join(root, "messages", locale, `${catalog}.json`), "utf8"));
}

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[full] = value;
    else Object.assign(out, flatten(value, full));
  }
  return out;
}

type Ast = { type: number; value?: string; options?: Record<string, { value: Ast }>; children?: Ast }[];

function variables(ast: Ast, found = new Set<string>()): Set<string> {
  for (const node of ast) {
    if (node.value && [1, 2, 3, 4, 5, 6].includes(node.type)) found.add(node.value);
    if (node.type === 8 && node.value) found.add(`<${node.value}>`);
    if (node.options) for (const option of Object.values(node.options)) variables(option.value, found);
    if (node.children) variables(node.children, found);
  }
  return found;
}

const all: Record<string, Record<string, string>> = Object.fromEntries(LOCALES.map((locale) => [locale, Object.assign({}, ...CATALOGS.map((c) => flatten(load(locale, c))))]));

describe("catalogues de traduction", () => {
  for (const locale of LOCALES.filter((l) => l !== "fr")) {
    it(`${locale} possède exactement les clés du français`, () => {
      expect(Object.keys(all[locale]!).sort()).toEqual(Object.keys(all.fr!).sort());
    });
  }

  for (const locale of LOCALES) {
    it(`${locale} : chaque message est un ICU valide`, () => {
      for (const [key, message] of Object.entries(all[locale]!)) {
        expect(() => new IntlMessageFormat(message, locale, undefined, { ignoreTag: false }), key).not.toThrow();
      }
    });
  }

  for (const locale of LOCALES.filter((l) => l !== "fr")) {
    it(`${locale} utilise les mêmes variables et balises que le français`, () => {
      for (const [key, message] of Object.entries(all.fr!)) {
        const source = variables(new IntlMessageFormat(message, "fr").getAst() as unknown as Ast);
        const target = variables(new IntlMessageFormat(all[locale]![key]!, locale).getAst() as unknown as Ast);
        expect([...target].sort(), key).toEqual([...source].sort());
      }
    });
  }

  it("aucune traduction n'est restée une copie du français", () => {
    const shared = Object.keys(all.fr!).filter((key) => all.ar![key] === all.fr![key] && /\p{L}{4,}/u.test(all.fr![key]!));
    const allowed = /^(issues\.tone|landing\.plan_(starter|pro)|landing\.mock_post_brand|domain\.lang|studio\.format_story)/;
    expect(shared.filter((key) => !allowed.test(key))).toEqual([]);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("clés utilisées dans le code", () => {
  it("chaque clé statique existe dans le catalogue français", () => {
    const missing: string[] = [];
    for (const file of sourceFiles(path.join(root, "src"))) {
      const code = readFileSync(file, "utf8");
      // Une même variable peut être liée à plusieurs espaces de noms dans un fichier :
      // chaque appel se rattache à la déclaration qui le précède.
      const bindings = [...code.matchAll(/const (\w+) = (?:await )?(?:useTranslations|getTranslations)\(\s*"([\w.]+)"\s*\)/g)];
      for (const variable of new Set(bindings.map((b) => b[1]!))) {
        for (const call of code.matchAll(new RegExp(String.raw`(?<![\w.])${variable}(?:\.rich)?\(\s*"([\w.]+)"`, "g"))) {
          const binding = bindings.filter((b) => b[1] === variable && b.index < call.index).at(-1);
          if (binding && !all.fr![`${binding[2]}.${call[1]}`]) missing.push(`${path.relative(root, file)}: ${binding[2]}.${call[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

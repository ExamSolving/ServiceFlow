import type { Language } from './languages';
import { en } from './messages/en';
import { hi } from './messages/hi';
import { te } from './messages/te';
import type { Messages, Translate } from './types';

export const MESSAGES: Record<Language, Messages> = { en, hi, te };

function lookup(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Whether a key exists, for keys built from server values such as an account reason. */
export function hasMessage(key: string): boolean {
  return lookup(en, key) !== undefined;
}

/** A translate function for one language. Missing text falls back to English, then to the key. */
export function createTranslator(language: Language): Translate {
  const messages = MESSAGES[language];
  const translate = (key: string, params?: Record<string, string | number>) =>
    interpolate(lookup(messages, key) ?? lookup(en, key) ?? key, params);
  return translate as Translate;
}

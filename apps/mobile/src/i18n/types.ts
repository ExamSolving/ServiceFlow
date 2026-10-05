import type { en } from './messages/en';

type Source = typeof en;

/** Same shape as the English messages, with any text: what hi.ts and te.ts must provide. */
export type Messages = Widen<Source>;
type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Every message key, for example "signIn.title". */
export type MessageKey = Leaves<Source>;
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

type ValueAt<T, Path extends string> = Path extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? ValueAt<T[Head], Rest>
    : never
  : Path extends keyof T
    ? T[Path]
    : never;

type Placeholders<Text> = Text extends `${string}{{${infer Name}}}${infer Rest}` ? Name | Placeholders<Rest> : never;

/** The {{placeholders}} a message needs, read from the English text. */
export type ParamsOf<Key extends MessageKey> = Placeholders<ValueAt<Source, Key>>;

/** Translate a key. Messages with placeholders require their values: t('home.signedInTo', { organization }). */
export type Translate = <Key extends MessageKey>(
  key: Key,
  ...params: [ParamsOf<Key>] extends [never] ? [] : [Record<ParamsOf<Key>, string | number>]
) => string;

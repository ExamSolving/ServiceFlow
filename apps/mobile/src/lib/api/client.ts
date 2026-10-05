import { env } from '@/lib/env';

/** A failed call to the ServiceFlow API, with the server's error code when there is one. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly reason: string | null;

  constructor(status: number, code: string | null, message: string, reason: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

interface RequestOptions {
  token?: string;
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  timeoutMs?: number;
}

/** Call the ServiceFlow API. The Firebase ID token travels as a Bearer token; no cookies are used. */
export async function apiRequest<T>(path: string, { token, method = 'GET', body, timeoutMs = 15000 }: RequestOptions = {}): Promise<T> {
  if (!env.apiUrl) throw new ApiError(0, 'CONFIG', 'The app doesn’t know the ServiceFlow server address yet.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${env.apiUrl}${path}`, {
      method,
      headers,
      // The API authenticates with the Bearer token only; never send cookies.
      credentials: 'omit',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const record = isRecord(data) ? data : {};
      throw new ApiError(response.status, text(record.code), text(record.message) ?? 'Something went wrong. Please try again.', text(record.reason));
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'NETWORK', 'We couldn’t reach ServiceFlow. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}

export { isRecord };

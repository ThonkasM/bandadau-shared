/** RFC 9457 Problem Details as served by every Bandada service (`application/problem+json`). */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
export const PROBLEM_TYPE_BASE_URL = 'https://api.bandadau.com/problems/';

export interface FieldError {
  field: string;
  pointer?: string;
  /** Stable code, e.g. `REQUIRED`, `TOO_LONG`. */
  code: string;
  message: string;
  params?: Record<string, unknown>;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  /** Stable UPPER_SNAKE_CASE code; clients translate by it (`@bandada/i18n` errors namespace). */
  code: string;
  detail?: string;
  instance?: string;
  traceId?: string;
  errors?: FieldError[];
  [extension: string]: unknown;
}

export function isProblem(value: unknown): value is ProblemDetails {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === 'string' &&
    typeof v.title === 'string' &&
    typeof v.code === 'string' &&
    typeof v.status === 'number' &&
    Number.isInteger(v.status) &&
    v.status >= 400 &&
    v.status <= 599
  );
}

export function isProblemWithCode<C extends string>(value: unknown, code: C): value is ProblemDetails & { code: C } {
  return isProblem(value) && value.code === code;
}

export interface CreateProblemInput {
  status: number;
  code: string;
  type?: string;
  title?: string;
  detail?: string;
  instance?: string;
  traceId?: string;
  errors?: FieldError[];
  [extension: string]: unknown;
}

export function problemTypeUrl(code: string): string {
  return `${PROBLEM_TYPE_BASE_URL}${code.toLowerCase().replace(/_/g, '-')}`;
}

export function createProblem(input: CreateProblemInput): ProblemDetails {
  const { status, code, type, title, ...rest } = input;
  return { ...rest, type: type ?? problemTypeUrl(code), title: title ?? code, status, code };
}

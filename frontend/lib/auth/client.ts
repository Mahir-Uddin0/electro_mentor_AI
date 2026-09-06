export type AuthUser = {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AuthTokenResponse = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  user: AuthUser;
};

export type AuthSession = {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  user: AuthUser;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type RegisterInput = SignInInput & {
  displayName: string;
};

export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:8000";

function errorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const message = (item as { msg?: unknown }).msg;
        return typeof message === "string" ? message : null;
      })
      .filter((message): message is string => Boolean(message));
    if (messages.length) return messages.join(" ");
  }
  return fallback;
}

async function authRequest<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl}/api/v1/auth/${path}`, {
      method: body ? "POST" : "GET",
      headers: body
        ? { Accept: "application/json", "Content-Type": "application/json" }
        : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AuthApiError(
      "Unable to reach the authentication service. Please try again.",
      0,
    );
  }

  if (!response.ok) {
    let bodyValue: unknown;
    try {
      bodyValue = await response.json();
    } catch {
      bodyValue = null;
    }
    throw new AuthApiError(
      errorMessage(bodyValue, "Authentication could not be completed."),
      response.status,
    );
  }

  return (await response.json()) as T;
}

function toSession(tokens: AuthTokenResponse): AuthSession {
  const now = Date.now();
  return {
    accessToken: tokens.access_token,
    accessTokenExpiresAt: now + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token,
    refreshTokenExpiresAt: now + tokens.refresh_expires_in * 1000,
    user: tokens.user,
  };
}

export async function registerWithBackend(
  input: RegisterInput,
): Promise<AuthSession> {
  return toSession(
    await authRequest<AuthTokenResponse>("register", {
      email: input.email.trim(),
      password: input.password,
      display_name: input.displayName.trim(),
    }),
  );
}

export async function signInWithBackend(
  input: SignInInput,
): Promise<AuthSession> {
  return toSession(
    await authRequest<AuthTokenResponse>("login", {
      email: input.email.trim(),
      password: input.password,
    }),
  );
}

export async function refreshBackendSession(
  refreshToken: string,
): Promise<AuthSession> {
  return toSession(
    await authRequest<AuthTokenResponse>("refresh", {
      refresh_token: refreshToken,
    }),
  );
}

export async function revokeBackendSession(refreshToken: string) {
  try {
    await fetch(`${backendUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Local logout must still complete if the backend is temporarily offline.
  }
}

export async function getBackendUser(accessToken: string): Promise<AuthUser> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl}/api/v1/auth/me`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AuthApiError(
      "Unable to reach the authentication service. Please try again.",
      0,
    );
  }

  if (!response.ok) {
    let bodyValue: unknown;
    try {
      bodyValue = await response.json();
    } catch {
      bodyValue = null;
    }
    throw new AuthApiError(
      errorMessage(bodyValue, "The session is no longer valid."),
      response.status,
    );
  }
  return (await response.json()) as AuthUser;
}

export const isPreviewModeAllowed =
  process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

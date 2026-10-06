export interface BasicAuth {
  type: 'basic';
  username: string;
  password: string;
}

export interface BearerAuth {
  type: 'bearer';
  token: string;
}

/** Explicit authentication scheme; omit auth for public endpoints. */
export type Auth = BasicAuth | BearerAuth;

export type QueryParams = Record<string, string | number | boolean | undefined>;

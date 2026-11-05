export declare const DEFAULT_RPC_ORIGINS: string;
export declare const DEFAULT_WALLET_ORIGINS: string;
export declare function contentSecurityPolicy(
  api: string,
  dev: boolean,
  env: Record<string, string | undefined>,
): string;

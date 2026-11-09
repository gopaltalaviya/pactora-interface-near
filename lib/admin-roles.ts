'use client';

import {useCallback, useEffect, useState} from 'react';
import {admin, type AdminRole} from './admin';
import {ApiError} from './api';
import {useSession} from './session';

/**
 * Whether the signed-in account may use /admin, for the account menu.
 *
 * The API tells with GET /v1/admin/me, which answers 403 to everyone else —
 * and a browser logs every 403 as a console error. So it is asked only when
 * the menu that would show the link opens (`wanted`), once per account per
 * tab (sessionStorage), never on every page for every person. A session
 * that already names roles (a future GET /v1/session field) is trusted
 * without asking.
 */

const KEY = (account: string) => `pactora.adminRoles.${account}`;

function readCached(account: string): AdminRole[] | null {
  try {
    const raw = window.sessionStorage.getItem(KEY(account));
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v.filter((r) => r === 'council' || r === 'reviewer') as AdminRole[]) : null;
  } catch {
    return null;
  }
}

function writeCached(account: string, roles: AdminRole[]): void {
  try {
    window.sessionStorage.setItem(KEY(account), JSON.stringify(roles));
  } catch {
    /* storage unavailable: asked again next time */
  }
}

export function useAdminRoles(wanted: boolean): {roles: AdminRole[]; known: boolean} {
  const {status, account, authed} = useSession();
  const [state, setState] = useState<{account: string; roles: AdminRole[]} | null>(null);

  const read = useCallback(async () => {
    if (!account) return;
    const cached = readCached(account);
    if (cached) {
      setState({account, roles: cached});
      return;
    }
    try {
      const me = await authed((t) => admin.me(t));
      writeCached(account, me.roles);
      setState({account, roles: me.roles});
    } catch (err) {
      // 403: not an admin. Anything else (the network): unknown for now, asked again later.
      if (err instanceof ApiError && err.status === 403) {
        writeCached(account, []);
        setState({account, roles: []});
      }
    }
  }, [account, authed]);

  useEffect(() => {
    if (status !== 'in' || !account) {
      setState(null);
      return;
    }
    const cached = readCached(account);
    if (cached) setState({account, roles: cached});
    else if (wanted) void read();
  }, [status, account, wanted, read]);

  const known = state !== null && state.account === account;
  return {roles: known ? state.roles : [], known};
}

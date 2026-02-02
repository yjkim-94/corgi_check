const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

export const api = {
  auth: {
    check: () => request<{ exists: boolean }>('/auth/check'),
    login: (password: string) =>
      request<{ success: boolean }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
  },
  status: {
    current: () => request<any[]>('/status/current'),
    update: (memberId: number, data: any) =>
      request('/status/' + memberId, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  history: {
    weeks: () => request<string[]>('/history/weeks'),
    detail: (week: string) => request<any>('/history/' + week),
  },
  members: {
    list: (includeLeft = false) =>
      request<any[]>(`/members?include_left=${includeLeft}`),
    create: (data: any) =>
      request('/members', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) =>
      request('/members/' + id, { method: 'PUT', body: JSON.stringify(data) }),
    leave: (id: number, data: any) =>
      request('/members/' + id + '/leave', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request('/members/' + id, { method: 'DELETE' }),
  },
  admin: {
    setPassword: (password: string) =>
      request('/admin/password', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    setManager: (name: string) =>
      request('/admin/manager', {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),
    getManager: () => request<{ name: string | null }>('/admin/manager'),
    getGmailAuthUrl: () =>
      request<{ url?: string; error?: string }>('/admin/gmail/auth-url'),
    getGmailStatus: () =>
      request<{ connected: boolean }>('/admin/gmail/status'),
    runSettlement: (weekStart: string) =>
      request<any>('/admin/settlement', {
        method: 'POST',
        body: JSON.stringify({ week_start: weekStart }),
      }),
    runMidSettlement: (weekStart: string) =>
      request<any>('/admin/mid-settlement', {
        method: 'POST',
        body: JSON.stringify({ week_start: weekStart }),
      }),
  },
};

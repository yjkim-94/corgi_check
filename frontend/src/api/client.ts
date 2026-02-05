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
    current: (weekStart?: string) =>
      request<any[]>('/status/current' + (weekStart ? `?week_start=${weekStart}` : '')),
    update: (memberId: number, data: {
      status: string;
      exclude_reason?: string | null;
      exclude_reason_detail?: string | null;
      consecutive_weeks?: number;
      week_start?: string | null;
    }) =>
      request<any>('/status/' + memberId, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getExcludeEnd: (memberId: number) =>
      request<{ last_week_label: string | null }>('/status/' + memberId + '/exclude-end'),
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
    return: (id: number) =>
      request('/members/' + id + '/return', { method: 'PUT' }),
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
    reset: (password: string) =>
      request<{ success: boolean }>('/admin/reset', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
  },
};

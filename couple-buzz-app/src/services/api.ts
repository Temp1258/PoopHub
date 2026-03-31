import { API_URL, DEMO_MODE } from '../constants';
import { storage } from '../utils/storage';

let isRefreshing = false;

async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing) return false;
  isRefreshing = true;

  try {
    const refreshToken = await storage.getRefreshToken();
    if (!refreshToken) return false;

    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    await storage.setAccessToken(data.access_token);
    await storage.setRefreshToken(data.refresh_token);
    return true;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

async function request<T>(path: string, options: RequestInit = {}, requiresAuth = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (requiresAuth) {
    const token = await storage.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && requiresAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = await storage.getAccessToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, { ...options, headers });
    }
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data as T;
}

export interface RegisterResponse {
  user_id: string;
  pair_code: string;
  access_token: string;
  refresh_token: string;
}

export interface PairResponse {
  success: boolean;
  partner_name: string;
}

export interface ActionResponse {
  success: boolean;
}

export interface HistoryAction {
  id: number;
  user_name: string;
  action_type: string;
  created_at: string;
}

export interface HistoryResponse {
  actions: HistoryAction[];
}

export interface UnpairResponse {
  success: boolean;
  new_pair_code: string;
}

const mockHistory: HistoryAction[] = [
  { id: 1, user_name: '我', action_type: 'miss', created_at: new Date().toISOString().slice(0, 19) },
  { id: 2, user_name: '宝贝', action_type: 'kiss', created_at: new Date().toISOString().slice(0, 19) },
  { id: 3, user_name: '我', action_type: 'poop', created_at: new Date(Date.now() - 3600000).toISOString().slice(0, 19) },
  { id: 4, user_name: '宝贝', action_type: 'pat', created_at: new Date(Date.now() - 7200000).toISOString().slice(0, 19) },
  { id: 5, user_name: '我', action_type: 'kiss', created_at: new Date(Date.now() - 86400000).toISOString().slice(0, 19) },
  { id: 6, user_name: '宝贝', action_type: 'miss', created_at: new Date(Date.now() - 86400000).toISOString().slice(0, 19) },
];

const demoApi = {
  async register(name: string, _deviceToken: string): Promise<RegisterResponse> {
    await new Promise(r => setTimeout(r, 500));
    return { user_id: 'demo-user-001', pair_code: 'AB12', access_token: 'demo-at', refresh_token: 'demo-rt' };
  },

  async pair(_partnerPairCode: string): Promise<PairResponse> {
    await new Promise(r => setTimeout(r, 500));
    return { success: true, partner_name: '宝贝' };
  },

  async sendAction(actionType: string): Promise<ActionResponse> {
    await new Promise(r => setTimeout(r, 300));
    return { success: true };
  },

  async getHistory(_limit = 50): Promise<HistoryResponse> {
    await new Promise(r => setTimeout(r, 300));
    return { actions: mockHistory };
  },

  async updateToken(_deviceToken: string): Promise<{ success: boolean }> {
    return { success: true };
  },

  async unpair(): Promise<UnpairResponse> {
    await new Promise(r => setTimeout(r, 300));
    return { success: true, new_pair_code: 'XY34' };
  },

  async logout(): Promise<{ success: boolean }> {
    return { success: true };
  },
};

const realApi = {
  register(name: string, deviceToken: string): Promise<RegisterResponse> {
    return request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ name, device_token: deviceToken }),
    }, false);
  },

  pair(partnerPairCode: string): Promise<PairResponse> {
    return request('/api/pair', {
      method: 'POST',
      body: JSON.stringify({ partner_pair_code: partnerPairCode }),
    });
  },

  sendAction(actionType: string): Promise<ActionResponse> {
    return request('/api/action', {
      method: 'POST',
      body: JSON.stringify({ action_type: actionType }),
    });
  },

  getHistory(limit = 50): Promise<HistoryResponse> {
    return request(`/api/history?limit=${limit}`);
  },

  updateToken(deviceToken: string): Promise<{ success: boolean }> {
    return request('/api/device-token', {
      method: 'PUT',
      body: JSON.stringify({ device_token: deviceToken }),
    });
  },

  unpair(): Promise<UnpairResponse> {
    return request('/api/unpair', {
      method: 'POST',
    });
  },

  logout(): Promise<{ success: boolean }> {
    return request('/api/logout', {
      method: 'POST',
    });
  },
};

export const api = DEMO_MODE ? demoApi : realApi;

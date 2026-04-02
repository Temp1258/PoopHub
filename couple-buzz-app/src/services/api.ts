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

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server error (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data as T;
}

export interface RegisterResponse {
  user_id: string;
  pair_code: string;
  partner_name: string | null;
  access_token: string;
  refresh_token: string;
}

export interface StatusResponse {
  paired: boolean;
  partner_name?: string;
  name: string;
  timezone: string;
  partner_timezone: string;
  partner_remark: string;
}

export interface ActionResponse {
  success: boolean;
}

export interface ProfileResponse {
  success: boolean;
  name: string;
  timezone: string;
  partner_timezone: string;
  partner_remark: string;
}

export interface HistoryAction {
  id: number;
  user_id: string;
  user_name: string;
  action_type: string;
  sender_timezone: string;
  created_at: string;
}

export interface HistoryResponse {
  actions: HistoryAction[];
}

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Asia/Shanghai';
  }
}

const mockHistory: HistoryAction[] = [
  { id: 1, user_id: 'demo-user-001', user_name: '我', action_type: 'miss', sender_timezone: 'Asia/Shanghai', created_at: new Date().toISOString().slice(0, 19) },
  { id: 2, user_id: 'demo-user-002', user_name: '宝贝', action_type: 'kiss', sender_timezone: 'America/New_York', created_at: new Date().toISOString().slice(0, 19) },
  { id: 3, user_id: 'demo-user-001', user_name: '我', action_type: 'poop', sender_timezone: 'Asia/Shanghai', created_at: new Date(Date.now() - 3600000).toISOString().slice(0, 19) },
  { id: 4, user_id: 'demo-user-002', user_name: '宝贝', action_type: 'pat', sender_timezone: 'America/New_York', created_at: new Date(Date.now() - 7200000).toISOString().slice(0, 19) },
];

const demoApi = {
  async register(name: string, _deviceToken: string): Promise<RegisterResponse> {
    await new Promise(r => setTimeout(r, 500));
    return { user_id: 'demo-user-001', pair_code: 'AB12', partner_name: '宝贝', access_token: 'demo-at', refresh_token: 'demo-rt' };
  },

  async getStatus(): Promise<StatusResponse> {
    await new Promise(r => setTimeout(r, 300));
    return { paired: true, partner_name: '宝贝', name: '我', timezone: 'Asia/Shanghai', partner_timezone: 'America/New_York', partner_remark: '' };
  },

  async sendAction(_actionType: string): Promise<ActionResponse> {
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

  async updateProfile(_name: string, _timezone: string, _partnerTimezone: string, _partnerRemark: string): Promise<ProfileResponse> {
    await new Promise(r => setTimeout(r, 300));
    return { success: true, name: _name, timezone: _timezone, partner_timezone: _partnerTimezone, partner_remark: _partnerRemark };
  },
};

const realApi = {
  register(name: string, deviceToken: string): Promise<RegisterResponse> {
    return request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ name, device_token: deviceToken, timezone: getDeviceTimezone() }),
    }, false);
  },

  getStatus(): Promise<StatusResponse> {
    return request('/api/status');
  },

  sendAction(actionType: string): Promise<ActionResponse> {
    return request('/api/action', {
      method: 'POST',
      body: JSON.stringify({ action_type: actionType, timezone: getDeviceTimezone() }),
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

  updateProfile(name: string, timezone: string, partnerTimezone: string, partnerRemark: string): Promise<ProfileResponse> {
    return request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ name, timezone, partner_timezone: partnerTimezone, partner_remark: partnerRemark }),
    });
  },
};

export const api = DEMO_MODE ? demoApi : realApi;

import { API_URL, API_KEY, DEMO_MODE } from '../constants';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data as T;
}

export interface RegisterResponse {
  user_id: string;
  pair_code: string;
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
    return { user_id: 'demo-user-001', pair_code: 'AB12' };
  },

  async pair(_userId: string, _partnerPairCode: string): Promise<PairResponse> {
    await new Promise(r => setTimeout(r, 500));
    return { success: true, partner_name: '宝贝' };
  },

  async sendAction(_userId: string, actionType: string): Promise<ActionResponse> {
    await new Promise(r => setTimeout(r, 300));
    return { success: true };
  },

  async getHistory(_userId: string, _limit = 50): Promise<HistoryResponse> {
    await new Promise(r => setTimeout(r, 300));
    return { actions: mockHistory };
  },

  async updateToken(_userId: string, _deviceToken: string): Promise<{ success: boolean }> {
    return { success: true };
  },
};

const realApi = {
  register(name: string, deviceToken: string): Promise<RegisterResponse> {
    return request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ name, device_token: deviceToken }),
    });
  },

  pair(userId: string, partnerPairCode: string): Promise<PairResponse> {
    return request('/api/pair', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, partner_pair_code: partnerPairCode }),
    });
  },

  sendAction(userId: string, actionType: string): Promise<ActionResponse> {
    return request('/api/action', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, action_type: actionType }),
    });
  },

  getHistory(userId: string, limit = 50): Promise<HistoryResponse> {
    return request(`/api/history?user_id=${userId}&limit=${limit}`);
  },

  updateToken(userId: string, deviceToken: string): Promise<{ success: boolean }> {
    return request('/api/device-token', {
      method: 'PUT',
      body: JSON.stringify({ user_id: userId, device_token: deviceToken }),
    });
  },
};

export const api = DEMO_MODE ? demoApi : realApi;

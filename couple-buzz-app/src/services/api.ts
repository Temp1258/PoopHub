import { API_URL, API_KEY } from '../constants';

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

export const api = {
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

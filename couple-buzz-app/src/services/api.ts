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
  streak: number;
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

export interface ImportantDate {
  id: number;
  user_id: string;
  partner_id: string;
  title: string;
  date: string;
  recurring: number;
  created_at: string;
}

export interface DatesResponse {
  dates: ImportantDate[];
  nearest: { title: string; date: string; days_away: number } | null;
}

export interface DailyQuestionResponse {
  question: string;
  question_index: number;
  date: string;
  my_answer: string | null;
  partner_answer: string | null;
  both_answered: boolean;
}

export interface StatsResponse {
  total_actions: number;
  my_actions: number;
  partner_actions: number;
  top_actions: { action_type: string; count: number }[];
  hourly: { hour: number; count: number }[];
  monthly: { month: string; count: number }[];
  first_action_date: string | null;
}

export interface CalendarDay {
  date: string;
  count: number;
  my_count: number;
  partner_count: number;
  top_action: string | null;
}

export interface CalendarResponse {
  days: CalendarDay[];
}

export interface DailyAnswerResponse {
  success: boolean;
  both_answered: boolean;
  partner_answer: string | null;
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
    return { paired: true, partner_name: '宝贝', name: '我', timezone: 'Asia/Shanghai', partner_timezone: 'America/New_York', partner_remark: '', streak: 7 };
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

  async getDates(): Promise<DatesResponse> {
    return { dates: [], nearest: { title: '见面', date: '2026-04-15', days_away: 12 } };
  },

  async createDate(_title: string, _date: string, _recurring: boolean): Promise<{ date: ImportantDate }> {
    return { date: { id: 1, user_id: '', partner_id: '', title: _title, date: _date, recurring: _recurring ? 1 : 0, created_at: '' } };
  },

  async deleteDate(_id: number): Promise<{ success: boolean }> {
    return { success: true };
  },

  async getDailyQuestion(): Promise<DailyQuestionResponse> {
    return { question: '你最喜欢对方的哪个特点？', question_index: 0, date: new Date().toISOString().slice(0, 10), my_answer: null, partner_answer: null, both_answered: false };
  },

  async submitDailyAnswer(_answer: string): Promise<DailyAnswerResponse> {
    return { success: true, both_answered: false, partner_answer: null };
  },

  async getStats(): Promise<StatsResponse> {
    return { total_actions: 0, my_actions: 0, partner_actions: 0, top_actions: [], hourly: [], monthly: [], first_action_date: null };
  },

  async getCalendar(_month: string): Promise<CalendarResponse> {
    return { days: [] };
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

  getDates(): Promise<DatesResponse> {
    return request('/api/dates');
  },

  createDate(title: string, date: string, recurring: boolean): Promise<{ date: ImportantDate }> {
    return request('/api/dates', {
      method: 'POST',
      body: JSON.stringify({ title, date, recurring }),
    });
  },

  deleteDate(id: number): Promise<{ success: boolean }> {
    return request(`/api/dates/${id}`, { method: 'DELETE' });
  },

  getDailyQuestion(): Promise<DailyQuestionResponse> {
    return request('/api/daily-question');
  },

  submitDailyAnswer(answer: string): Promise<DailyAnswerResponse> {
    return request('/api/daily-question/answer', {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
  },

  getStats(): Promise<StatsResponse> {
    return request('/api/stats');
  },

  getCalendar(month: string): Promise<CalendarResponse> {
    return request(`/api/calendar?month=${month}`);
  },
};

export const api = DEMO_MODE ? demoApi : realApi;

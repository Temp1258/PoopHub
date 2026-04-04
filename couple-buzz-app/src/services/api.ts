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
  access_token: string;
  refresh_token: string;
}

export interface LoginResponse {
  user_id: string;
  partner_name: string | null;
  access_token: string;
  refresh_token: string;
}

export interface PairResponse {
  success: boolean;
  partner_name: string;
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
  reply_to?: number | null;
  created_at: string;
}

export interface HistoryResponse {
  actions: HistoryAction[];
  reactions: Record<number, HistoryAction[]>;
}

export interface ReactionResponse {
  success: boolean;
  reaction_id: number;
}

export interface WsTicketResponse {
  ticket: string;
  expires_in: number;
}

export interface ImportantDate {
  id: number;
  user_id: string;
  partner_id: string;
  title: string;
  date: string;
  recurring: number;
  pinned: number;
  created_at: string;
}

export interface DatesResponse {
  dates: ImportantDate[];
  pinned: { title: string; date: string; days_away: number } | null;
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

export interface RitualStatusResponse {
  local_hour: number;
  morning: { my_completed: boolean; partner_completed: boolean; both_completed: boolean };
  evening: { my_completed: boolean; partner_completed: boolean; both_completed: boolean };
  daily_recap: { total_interactions: number; top_action: string | null } | null;
}

export interface RitualResponse {
  success: boolean;
  ritual_type: string;
  ritual_date: string;
  both_completed: boolean;
}

export interface MailboxResponse {
  week_key: string;
  phase: 'writing' | 'revealed';
  my_message: string | null;
  partner_message: string | null;
  partner_wrote?: boolean;
  reveal_at: string;
  can_edit: boolean;
}

export interface MailboxArchiveResponse {
  weeks: { week_key: string; my_content: string | null; partner_content: string | null }[];
}

export interface WeeklyReportResponse {
  week_key: string;
  total: number;
  last_week_total: number;
  change_percent: number;
  my_count: number;
  partner_count: number;
  streak: number;
  top_actions: { action_type: string; count: number }[];
  daily_question_rate: string;
  ritual_morning_rate: string;
  ritual_evening_rate: string;
  temperature: number;
  temperature_label: string;
}

export interface CapsuleItem {
  id: number;
  author: 'me' | 'partner';
  content: string | null;
  unlock_date: string;
  is_unlockable: boolean;
  opened_at: string | null;
  created_at: string;
}

export interface BucketItemResponse {
  id: number;
  user_id: string;
  partner_id: string;
  title: string;
  category: string | null;
  completed: number;
  completed_by: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
}

export interface SnapTodayResponse {
  snap_date: string;
  my_snapped: boolean;
  partner_snapped: boolean;
  my_photo: string | null;
  partner_photo: string | null;
}

export interface SnapMonth {
  date: string;
  my_photo: string | null;
  partner_photo: string | null;
  both_snapped: boolean;
}

export interface WeeklyChallengeResponse {
  challenge: {
    id: number;
    title: string;
    description: string;
    type: string;
    target: number;
    reward_points: number;
    difficulty: string;
  };
  progress: number;
  target: number;
  status: 'active' | 'completed' | 'expired';
  week_start: string;
  my_response: string | null;
  couple_points: number;
}

export interface CoincidenceStatsResponse {
  total_count: number;
  total_seconds: number;
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
  async register(name: string, _password: string): Promise<RegisterResponse> {
    await new Promise(r => setTimeout(r, 500));
    return { user_id: 'AB12CD', access_token: 'demo-at', refresh_token: 'demo-rt' };
  },

  async login(_userId: string, _password: string): Promise<LoginResponse> {
    await new Promise(r => setTimeout(r, 500));
    return { user_id: 'AB12CD', partner_name: '宝贝', access_token: 'demo-at', refresh_token: 'demo-rt' };
  },

  async pair(_partnerId: string): Promise<PairResponse> {
    await new Promise(r => setTimeout(r, 500));
    return { success: true, partner_name: '宝贝' };
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
    return { actions: mockHistory, reactions: {} };
  },

  async sendReaction(_actionId: number, _actionType: string): Promise<ReactionResponse> {
    return { success: true, reaction_id: 99 };
  },

  async getWsTicket(): Promise<WsTicketResponse> {
    return { ticket: 'demo-ticket', expires_in: 30 };
  },

  async updateToken(_deviceToken: string): Promise<{ success: boolean }> {
    return { success: true };
  },

  async updateProfile(_name: string, _timezone: string, _partnerTimezone: string, _partnerRemark: string): Promise<ProfileResponse> {
    await new Promise(r => setTimeout(r, 300));
    return { success: true, name: _name, timezone: _timezone, partner_timezone: _partnerTimezone, partner_remark: _partnerRemark };
  },

  async getDates(): Promise<DatesResponse> {
    return { dates: [], pinned: { title: '见面', date: '2026-04-15', days_away: 12 } };
  },

  async createDate(_title: string, _date: string, _recurring: boolean): Promise<{ date: ImportantDate }> {
    return { date: { id: 1, user_id: '', partner_id: '', title: _title, date: _date, recurring: _recurring ? 1 : 0, pinned: 0, created_at: '' } };
  },

  async deleteDate(_id: number): Promise<{ success: boolean }> {
    return { success: true };
  },

  async pinDate(_id: number): Promise<{ success: boolean }> {
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

  async getRitualStatus(): Promise<RitualStatusResponse> {
    return { local_hour: 9, morning: { my_completed: false, partner_completed: false, both_completed: false }, evening: { my_completed: false, partner_completed: false, both_completed: false }, daily_recap: null };
  },

  async submitRitual(_type: 'morning' | 'evening'): Promise<RitualResponse> {
    return { success: true, ritual_type: _type, ritual_date: new Date().toISOString().slice(0, 10), both_completed: false };
  },

  async getMailbox(): Promise<MailboxResponse> {
    return { week_key: '', phase: 'writing', my_message: null, partner_message: null, reveal_at: '', can_edit: true };
  },

  async submitMailbox(_content: string): Promise<{ success: boolean }> {
    return { success: true };
  },

  async getMailboxArchive(_limit?: number): Promise<MailboxArchiveResponse> {
    return { weeks: [] };
  },

  async getWeeklyReport(_week?: string): Promise<WeeklyReportResponse> {
    return { week_key: '', total: 0, last_week_total: 0, change_percent: 0, my_count: 0, partner_count: 0, streak: 0, top_actions: [], daily_question_rate: '0/7', ritual_morning_rate: '0/7', ritual_evening_rate: '0/7', temperature: 0, temperature_label: '' };
  },

  async createCapsule(_content: string, _unlockDate: string): Promise<{ id: number }> {
    return { id: 1 };
  },
  async getCapsules(): Promise<{ capsules: CapsuleItem[] }> {
    return { capsules: [] };
  },
  async openCapsule(_id: number): Promise<{ success: boolean; content: string }> {
    return { success: true, content: '' };
  },

  async getBucket(): Promise<{ items: BucketItemResponse[]; total: number; completed_count: number }> {
    return { items: [], total: 0, completed_count: 0 };
  },
  async createBucketItem(_title: string, _category?: string): Promise<{ item: BucketItemResponse }> {
    return { item: {} as any };
  },
  async completeBucketItem(_id: number): Promise<{ success: boolean }> {
    return { success: true };
  },
  async uncompleteBucketItem(_id: number): Promise<{ success: boolean }> {
    return { success: true };
  },
  async deleteBucketItem(_id: number): Promise<{ success: boolean }> {
    return { success: true };
  },

  async getSnapToday(): Promise<SnapTodayResponse> {
    return { snap_date: '', my_snapped: false, partner_snapped: false, my_photo: null, partner_photo: null };
  },
  async getSnaps(_month: string): Promise<{ snaps: SnapMonth[] }> {
    return { snaps: [] };
  },

  async getWeeklyChallenge(): Promise<WeeklyChallengeResponse> {
    return { challenge: { id: 0, title: '', description: '', type: '', target: 0, reward_points: 0, difficulty: '' }, progress: 0, target: 0, status: 'active', week_start: '', my_response: null, couple_points: 0 };
  },
  async submitChallengeResponse(_response: string): Promise<{ success: boolean }> {
    return { success: true };
  },
  async getCouplePoints(): Promise<{ points: number }> {
    return { points: 0 };
  },
  async getCoincidenceStats(): Promise<CoincidenceStatsResponse> {
    return { total_count: 0, total_seconds: 0 };
  },
};

const realApi = {
  register(name: string, password: string): Promise<RegisterResponse> {
    return request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ name, password, timezone: getDeviceTimezone() }),
    }, false);
  },

  login(userId: string, password: string): Promise<LoginResponse> {
    return request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, password }),
    }, false);
  },

  pair(partnerId: string): Promise<PairResponse> {
    return request('/api/pair', {
      method: 'POST',
      body: JSON.stringify({ partner_id: partnerId }),
    });
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

  sendReaction(actionId: number, actionType: string): Promise<ReactionResponse> {
    return request('/api/reaction', {
      method: 'POST',
      body: JSON.stringify({ action_id: actionId, action_type: actionType }),
    });
  },

  getWsTicket(): Promise<WsTicketResponse> {
    return request('/api/ws-ticket');
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

  pinDate(id: number): Promise<{ success: boolean }> {
    return request(`/api/dates/${id}/pin`, { method: 'POST' });
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

  getRitualStatus(): Promise<RitualStatusResponse> {
    return request('/api/ritual/status');
  },

  submitRitual(type: 'morning' | 'evening'): Promise<RitualResponse> {
    return request('/api/ritual', {
      method: 'POST',
      body: JSON.stringify({ ritual_type: type }),
    });
  },

  getMailbox(): Promise<MailboxResponse> {
    return request('/api/mailbox');
  },

  submitMailbox(content: string): Promise<{ success: boolean }> {
    return request('/api/mailbox', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  getMailboxArchive(limit = 10): Promise<MailboxArchiveResponse> {
    return request(`/api/mailbox/archive?limit=${limit}`);
  },

  getWeeklyReport(week?: string): Promise<WeeklyReportResponse> {
    return request(`/api/weekly-report${week ? `?week=${week}` : ''}`);
  },

  createCapsule(content: string, unlockDate: string): Promise<{ id: number }> {
    return request('/api/capsules', { method: 'POST', body: JSON.stringify({ content, unlock_date: unlockDate }) });
  },
  getCapsules(): Promise<{ capsules: CapsuleItem[] }> {
    return request('/api/capsules');
  },
  openCapsule(id: number): Promise<{ success: boolean; content: string }> {
    return request(`/api/capsules/${id}/open`, { method: 'POST' });
  },

  getBucket(): Promise<{ items: BucketItemResponse[]; total: number; completed_count: number }> {
    return request('/api/bucket');
  },
  createBucketItem(title: string, category?: string): Promise<{ item: BucketItemResponse }> {
    return request('/api/bucket', { method: 'POST', body: JSON.stringify({ title, category }) });
  },
  completeBucketItem(id: number): Promise<{ success: boolean }> {
    return request(`/api/bucket/${id}/complete`, { method: 'POST' });
  },
  uncompleteBucketItem(id: number): Promise<{ success: boolean }> {
    return request(`/api/bucket/${id}/uncomplete`, { method: 'POST' });
  },
  deleteBucketItem(id: number): Promise<{ success: boolean }> {
    return request(`/api/bucket/${id}`, { method: 'DELETE' });
  },

  getSnapToday(): Promise<SnapTodayResponse> {
    return request('/api/snaps/today');
  },
  getSnaps(month: string): Promise<{ snaps: SnapMonth[] }> {
    return request(`/api/snaps?month=${month}`);
  },

  getWeeklyChallenge(): Promise<WeeklyChallengeResponse> {
    return request('/api/weekly-challenge');
  },
  submitChallengeResponse(response: string): Promise<{ success: boolean }> {
    return request('/api/weekly-challenge/response', { method: 'POST', body: JSON.stringify({ response }) });
  },
  getCouplePoints(): Promise<{ points: number }> {
    return request('/api/couple-points');
  },
  getCoincidenceStats(): Promise<CoincidenceStatsResponse> {
    return request('/api/coincidences/stats');
  },
};

export const api = DEMO_MODE ? demoApi : realApi;

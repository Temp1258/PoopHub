import { API_URL } from '../constants';
import { storage } from '../utils/storage';

// Thrown only when the server has definitively rejected the session
// (401 even after a refresh attempt). Network failures, DNS errors,
// 5xx responses, and wrong API URLs throw plain Error — callers must
// not treat those as "user is logged out".
export class AuthError extends Error {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthError';
  }
}

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

    // Still 401 after refresh attempt — definitive auth failure.
    if (res.status === 401) {
      throw new AuthError();
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
  partner_id?: string;
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
  pinned: { title: string; date: string; days_away: number; days_diff: number } | null;
}

export interface DailyQuestionResponse {
  question: string;
  question_index: number;
  date: string;
  my_answer: string | null;
  partner_answer: string | null;
  partner_answered: boolean;
  both_answered: boolean;
  my_reaction_to_partner: 'up' | 'down' | null;
  partner_reaction_to_me: 'up' | 'down' | null;
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
  // In writing phase the server hides own content (sealed in transit). Use
  // `my_sealed` to know whether the user already submitted this round.
  my_message: string | null;
  my_sealed: boolean;
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
  visibility: 'self' | 'partner';
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
  my_reaction_to_partner: 'up' | 'down' | null;
  partner_reaction_to_me: 'up' | 'down' | null;
}

export interface SnapMonth {
  date: string;
  my_photo: string | null;
  partner_photo: string | null;
  both_snapped: boolean;
}

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Asia/Shanghai';
  }
}

export const api = {
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

  markRead(lastId: number): Promise<{ success: boolean; unread: number }> {
    return request('/api/mark-read', {
      method: 'POST',
      body: JSON.stringify({ last_id: lastId }),
    });
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

  createCapsule(content: string, unlockDate: string, visibility: 'self' | 'partner'): Promise<{ id: number }> {
    return request('/api/capsules', { method: 'POST', body: JSON.stringify({ content, unlock_date: unlockDate, visibility }) });
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

  urge(type: 'question' | 'snap'): Promise<{ success: boolean }> {
    return request('/api/urge', { method: 'POST', body: JSON.stringify({ type }) });
  },
  dailyReaction(type: 'question' | 'snap', reaction: 'up' | 'down'): Promise<{ success: boolean; reaction: 'up' | 'down' }> {
    return request('/api/daily-reaction', { method: 'POST', body: JSON.stringify({ type, reaction }) });
  },
};

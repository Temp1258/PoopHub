import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  USER_ID: 'couple_buzz_user_id',
  PARTNER_ID: 'couple_buzz_partner_id',
  PARTNER_NAME: 'couple_buzz_partner_name',
  USER_NAME: 'couple_buzz_user_name',
  ACCESS_TOKEN: 'couple_buzz_access_token',
  REFRESH_TOKEN: 'couple_buzz_refresh_token',
  TIMEZONE: 'couple_buzz_timezone',
  PARTNER_TIMEZONE: 'couple_buzz_partner_timezone',
  PARTNER_REMARK: 'couple_buzz_partner_remark',
  DAILY_SEEN_DATE: 'couple_buzz_daily_seen_date',
  DAILY_SEEN_PA: 'couple_buzz_daily_seen_pa',
  DAILY_SEEN_PS: 'couple_buzz_daily_seen_ps',
  INBOX_LAST_SEEN: 'couple_buzz_inbox_last_seen',
  OUTBOX_LAST_SEEN: 'couple_buzz_outbox_last_seen',
  WRITE_LETTER_DRAFT: 'couple_buzz_write_letter_draft',
};

export const storage = {
  async getUserId(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.USER_ID);
  },

  async setUserId(id: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER_ID, id);
  },

  async getPartnerName(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.PARTNER_NAME);
  },

  async setPartnerName(name: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PARTNER_NAME, name);
  },

  async getUserName(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.USER_NAME);
  },

  async setUserName(name: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER_NAME, name);
  },

  async getAccessToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
  },

  async setAccessToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, token);
  },

  async getRefreshToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
  },

  async setRefreshToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, token);
  },

  // Atomic two-token write. AsyncStorage.setItem is per-key; if the JS thread
  // is suspended / the app is killed between two consecutive setItem calls,
  // disk ends up with NEW_ACCESS + OLD_REFRESH. The server already rotated
  // (deleted OLD_REFRESH at response time), so the next refresh dies with 401
  // and the user gets booted to login. multiSet hands both writes to the
  // native module in one batch — far less likely to be torn apart.
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await AsyncStorage.multiSet([
      [KEYS.ACCESS_TOKEN, accessToken],
      [KEYS.REFRESH_TOKEN, refreshToken],
    ]);
  },

  async getTimezone(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.TIMEZONE);
  },

  async setTimezone(tz: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.TIMEZONE, tz);
  },

  async getPartnerTimezone(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.PARTNER_TIMEZONE);
  },

  async setPartnerTimezone(tz: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PARTNER_TIMEZONE, tz);
  },

  async getPartnerRemark(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.PARTNER_REMARK);
  },

  async setPartnerRemark(remark: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PARTNER_REMARK, remark);
  },

  async getPartnerId(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.PARTNER_ID);
  },

  async setPartnerId(id: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PARTNER_ID, id);
  },

  async getDailySeen(): Promise<{ date: string | null; pa: boolean; ps: boolean }> {
    const [date, pa, ps] = await Promise.all([
      AsyncStorage.getItem(KEYS.DAILY_SEEN_DATE),
      AsyncStorage.getItem(KEYS.DAILY_SEEN_PA),
      AsyncStorage.getItem(KEYS.DAILY_SEEN_PS),
    ]);
    return { date, pa: pa === '1', ps: ps === '1' };
  },

  async setDailySeen(date: string, partnerAnswered: boolean, partnerSnapped: boolean): Promise<void> {
    await Promise.all([
      AsyncStorage.setItem(KEYS.DAILY_SEEN_DATE, date),
      AsyncStorage.setItem(KEYS.DAILY_SEEN_PA, partnerAnswered ? '1' : '0'),
      AsyncStorage.setItem(KEYS.DAILY_SEEN_PS, partnerSnapped ? '1' : '0'),
    ]);
  },

  async getInboxLastSeen(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.INBOX_LAST_SEEN);
  },

  async setInboxLastSeen(iso: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.INBOX_LAST_SEEN, iso);
  },

  // Outbox-side equivalent of INBOX_LAST_SEEN. Drives the outbox 🚩 + the
  // 信箱 tab dot for fresh outgoing letters: any pending letter created
  // after this marker counts as "fresh" until the user opens OutboxScreen,
  // which advances the marker to "now".
  async getOutboxLastSeen(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.OUTBOX_LAST_SEEN);
  },

  async setOutboxLastSeen(iso: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.OUTBOX_LAST_SEEN, iso);
  },

  // Draft body of an in-progress letter from WriteLetterScreen. Persists
  // across modal close so the user doesn't lose typed content if they
  // accidentally exit. Cleared on successful submit.
  async getWriteLetterDraft(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.WRITE_LETTER_DRAFT);
  },

  async setWriteLetterDraft(text: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.WRITE_LETTER_DRAFT, text);
  },

  async clearWriteLetterDraft(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.WRITE_LETTER_DRAFT);
  },

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};

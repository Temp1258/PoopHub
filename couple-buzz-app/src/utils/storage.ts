import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  USER_ID: 'couple_buzz_user_id',
  PARTNER_NAME: 'couple_buzz_partner_name',
  USER_NAME: 'couple_buzz_user_name',
  ACCESS_TOKEN: 'couple_buzz_access_token',
  REFRESH_TOKEN: 'couple_buzz_refresh_token',
  TIMEZONE: 'couple_buzz_timezone',
  PARTNER_TIMEZONE: 'couple_buzz_partner_timezone',
  PARTNER_REMARK: 'couple_buzz_partner_remark',
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

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  USER_ID: 'couple_buzz_user_id',
  PAIR_CODE: 'couple_buzz_pair_code',
  PARTNER_NAME: 'couple_buzz_partner_name',
  USER_NAME: 'couple_buzz_user_name',
};

export const storage = {
  async getUserId(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.USER_ID);
  },

  async setUserId(id: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER_ID, id);
  },

  async getPairCode(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.PAIR_CODE);
  },

  async setPairCode(code: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PAIR_CODE, code);
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

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};

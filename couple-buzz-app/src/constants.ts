import Constants from 'expo-constants';

export const API_URL = Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3000';

export const COLORS = {
  background: '#FFF5F5',
  text: '#5C4033',
  textLight: '#8B7355',
  white: '#FFFFFF',
  border: '#F0E0E0',
  kiss: '#FF8FAB',
};

export type ActionType =
  | 'miss' | 'love' | 'kiss' | 'pat' | 'finger_heart' | 'shy' | 'rose' | 'hug'
  | 'haha' | 'hehe' | 'cry' | 'wuwu' | 'sad' | 'clown'
  | 'angry_silent' | 'angry_talk'
  | 'eat' | 'hungry' | 'sleepy' | 'sleep' | 'play' | 'clean' | 'poop' | 'pick_nose'
  | 'slap' | 'gym' | 'milk_tea' | 'drink'
  | 'work' | 'where_r_u' | 'what_doing' | 'ping'
  | 'call_wife' | 'call_husband' | 'call_baby';

export interface ActionConfig {
  type: ActionType;
  emoji: string;
  label: string;
  color: string;
}

export interface ActionCategory {
  title: string;
  actions: ActionConfig[];
}

export const ACTION_CATEGORIES: ActionCategory[] = [
  {
    title: '表达爱意',
    actions: [
      { type: 'miss', emoji: '💕', label: '想你', color: '#FFB5C2' },
      { type: 'love', emoji: '❤️', label: '爱你', color: '#FF8FAB' },
      { type: 'kiss', emoji: '😘', label: '亲亲', color: '#FF8FAB' },
      { type: 'pat', emoji: '🫶', label: '比大心', color: '#B5D8CC' },
      { type: 'finger_heart', emoji: '🫰', label: '比心', color: '#FFCAD4' },
      { type: 'rose', emoji: '🌹', label: '玫瑰', color: '#FF8FAB' },
      { type: 'hug', emoji: '🤗', label: '抱抱', color: '#FFCAD4' },
      { type: 'slap', emoji: '👋', label: '打你', color: '#FF9B9B' },
    ],
  },
  {
    title: '心情',
    actions: [
      { type: 'shy', emoji: '😳', label: '害羞', color: '#FFB8C6' },
      { type: 'haha', emoji: '😆', label: '哈哈', color: '#FFEAA7' },
      { type: 'hehe', emoji: '😏', label: '嘿嘿', color: '#FFD699' },
      { type: 'cry', emoji: '🥹', label: '哭哭', color: '#FFB5C2' },
      { type: 'wuwu', emoji: '🥺', label: '呜呜', color: '#FFCAD4' },
      { type: 'sad', emoji: '💔', label: '伤心', color: '#D4C5A9' },
      { type: 'angry_silent', emoji: '🙉', label: '生气·闭嘴', color: '#FF9B9B' },
      { type: 'angry_talk', emoji: '😤', label: '生气·说话', color: '#FFB088' },
      { type: 'clown', emoji: '🤡', label: '小丑', color: '#FFD699' },
    ],
  },
  {
    title: '日常',
    actions: [
      { type: 'eat', emoji: '🍚', label: '吃饭', color: '#FFD699' },
      { type: 'hungry', emoji: '🫠', label: '饿', color: '#FFEAA7' },
      { type: 'sleepy', emoji: '😴', label: '困', color: '#C3AED6' },
      { type: 'sleep', emoji: '🛌', label: '睡觉', color: '#C3AED6' },
      { type: 'play', emoji: '🎮', label: '玩', color: '#A8D8EA' },
      { type: 'clean', emoji: '🧹', label: '打扫卫生', color: '#B8E6CF' },
      { type: 'poop', emoji: '💩', label: '晒特', color: '#C4A882' },
      { type: 'pick_nose', emoji: '🤏', label: '抠鼻屎', color: '#D4C5A9' },
      { type: 'work', emoji: '💻', label: '工作', color: '#A8D8EA' },
      { type: 'gym', emoji: '🏋️', label: '健身', color: '#B5D8CC' },
      { type: 'milk_tea', emoji: '🧋', label: '喝奶茶', color: '#E3C9A8' },
      { type: 'drink', emoji: '🥤', label: '喝饮料', color: '#A8D8EA' },
    ],
  },
  {
    title: '找你',
    actions: [
      { type: 'ping', emoji: '🛎️', label: 'Ping', color: '#FFD699' },
      { type: 'call_wife', emoji: '👰', label: '召唤老婆', color: '#FFB5C2' },
      { type: 'call_husband', emoji: '🤵', label: '召唤老公', color: '#A8D8EA' },
      { type: 'call_baby', emoji: '🍼', label: '召唤宝贝', color: '#FFCAD4' },
    ],
  },
];

// Flat list for backward compatibility
export const ACTIONS: ActionConfig[] = ACTION_CATEGORIES.flatMap(c => c.actions);

export const ACTION_EMOJI: Record<string, string> = Object.fromEntries(
  ACTIONS.map(a => [a.type, a.emoji])
);

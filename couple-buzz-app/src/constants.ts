// Set to true to use mock data without a backend server
export const DEMO_MODE = true;

// Update this to your VPS domain
export const API_URL = 'https://your-domain.com';

// Optional: fixed API key (must match server .env)
export const API_KEY = 'your-random-secret-key-here';

export const COLORS = {
  background: '#FFF5F5',
  miss: '#FFB5C2',
  kiss: '#FF8FAB',
  poop: '#C4A882',
  pat: '#B5D8CC',
  text: '#5C4033',
  textLight: '#8B7355',
  white: '#FFFFFF',
  border: '#F0E0E0',
};

export type ActionType = 'miss' | 'kiss' | 'poop' | 'pat';

export interface ActionConfig {
  type: ActionType;
  emoji: string;
  label: string;
  color: string;
}

export const ACTIONS: ActionConfig[] = [
  { type: 'miss', emoji: '💭', label: '想你', color: COLORS.miss },
  { type: 'kiss', emoji: '😘', label: '亲亲', color: COLORS.kiss },
  { type: 'poop', emoji: '💩', label: '拉屎', color: COLORS.poop },
  { type: 'pat',  emoji: '🫶', label: '拍拍', color: COLORS.pat },
];

export const ACTION_EMOJI: Record<string, string> = {
  miss: '💭',
  kiss: '😘',
  poop: '💩',
  pat: '🫶',
};

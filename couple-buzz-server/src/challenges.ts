export interface ChallengeDefinition {
  id: number;
  title: string;
  description: string;
  type: 'action_count' | 'action_any_count' | 'streak_days' | 'action_variety' | 'custom_response' | 'daily_question_count';
  target: number;
  action_type?: string;
  reward_points: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const CHALLENGES: ChallengeDefinition[] = [
  // Easy — action_count
  { id: 0, title: '想念轰炸', description: '这周给对方发30次想你', type: 'action_count', target: 30, action_type: 'miss', reward_points: 10, difficulty: 'easy' },
  { id: 1, title: '亲亲达人', description: '这周给对方发20次亲亲', type: 'action_count', target: 20, action_type: 'kiss', reward_points: 10, difficulty: 'easy' },
  { id: 2, title: '爱的呼唤', description: '这周给对方发25次爱你', type: 'action_count', target: 25, action_type: 'love', reward_points: 10, difficulty: 'easy' },
  { id: 3, title: '抱抱大赛', description: '这周给对方发20次抱抱', type: 'action_count', target: 20, action_type: 'hug', reward_points: 10, difficulty: 'easy' },
  { id: 4, title: '玫瑰花园', description: '这周给对方送15朵玫瑰', type: 'action_count', target: 15, action_type: 'rose', reward_points: 10, difficulty: 'easy' },
  { id: 5, title: '比心狂魔', description: '这周比心20次', type: 'action_count', target: 20, action_type: 'finger_heart', reward_points: 10, difficulty: 'easy' },
  { id: 6, title: 'Ping 大师', description: '这周 Ping 对方15次', type: 'action_count', target: 15, action_type: 'ping', reward_points: 10, difficulty: 'easy' },
  { id: 7, title: '害羞的你', description: '这周害羞15次', type: 'action_count', target: 15, action_type: 'shy', reward_points: 10, difficulty: 'easy' },
  { id: 8, title: '哈哈乐园', description: '这周笑20次', type: 'action_count', target: 20, action_type: 'haha', reward_points: 10, difficulty: 'easy' },
  { id: 9, title: '嘿嘿嘿', description: '这周嘿嘿15次', type: 'action_count', target: 15, action_type: 'hehe', reward_points: 10, difficulty: 'easy' },

  // Medium — action_any_count
  { id: 10, title: '互动狂魔', description: '这周一共互动100次', type: 'action_any_count', target: 100, reward_points: 20, difficulty: 'medium' },
  { id: 11, title: '甜蜜一周', description: '这周一共互动80次', type: 'action_any_count', target: 80, reward_points: 15, difficulty: 'medium' },
  { id: 12, title: '超级互动', description: '这周一共互动150次', type: 'action_any_count', target: 150, reward_points: 25, difficulty: 'medium' },

  // Medium — streak_days
  { id: 20, title: '连续打卡', description: '这周每天双方都互动（至少5天）', type: 'streak_days', target: 5, reward_points: 25, difficulty: 'medium' },
  { id: 21, title: '全勤互动', description: '这周7天双方都互动', type: 'streak_days', target: 7, reward_points: 35, difficulty: 'medium' },

  // Medium — action_variety
  { id: 30, title: '花样百出', description: '这周使用10种不同的表情', type: 'action_variety', target: 10, reward_points: 20, difficulty: 'medium' },
  { id: 31, title: '表情收集', description: '这周使用15种不同的表情', type: 'action_variety', target: 15, reward_points: 30, difficulty: 'medium' },
  { id: 32, title: '全能选手', description: '这周使用20种不同的表情', type: 'action_variety', target: 20, reward_points: 40, difficulty: 'medium' },

  // Medium — daily_question_count
  { id: 40, title: '问答达人', description: '这周完成5天每日问答（双方都答）', type: 'daily_question_count', target: 5, reward_points: 25, difficulty: 'medium' },
  { id: 41, title: '问答全勤', description: '这周每天都完成每日问答', type: 'daily_question_count', target: 7, reward_points: 35, difficulty: 'medium' },

  // Hard — custom_response
  { id: 50, title: '音乐传情', description: '用一首歌表达你今天的心情，写下歌名和原因', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 51, title: '回忆录', description: '写下一段你们在一起最难忘的回忆', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 52, title: '未来的信', description: '给一年后的你们写一段话', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 53, title: '感谢清单', description: '写出3件最感谢对方的事情', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 54, title: '梦想旅程', description: '描述你最想和对方一起去的地方，以及为什么', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 55, title: '初遇回忆', description: '写下你第一次见到对方时的感受', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 56, title: '十年之后', description: '想象十年后你们的生活，写下你的期待', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 57, title: '如果重来', description: '如果能回到你们刚认识的时候，你会做什么不同的事？', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 58, title: '偷偷告白', description: '写一段平时不好意思说出口的情话', type: 'custom_response', target: 1, reward_points: 20, difficulty: 'hard' },
  { id: 59, title: '今日表白', description: '用三句话形容你对 ta 的感觉', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },

  // More action_count variety
  { id: 60, title: '日常报告', description: '这周发20次吃饭/睡觉/工作', type: 'action_count', target: 20, action_type: 'eat', reward_points: 10, difficulty: 'easy' },
  { id: 61, title: '大心连发', description: '这周比大心25次', type: 'action_count', target: 25, action_type: 'pat', reward_points: 10, difficulty: 'easy' },
  { id: 62, title: '调皮一周', description: '这周打对方20次', type: 'action_count', target: 20, action_type: 'slap', reward_points: 10, difficulty: 'easy' },
  { id: 63, title: '哭哭鬼', description: '这周哭15次', type: 'action_count', target: 15, action_type: 'cry', reward_points: 10, difficulty: 'easy' },
  { id: 64, title: '呜呜大赛', description: '这周呜呜15次', type: 'action_count', target: 15, action_type: 'wuwu', reward_points: 10, difficulty: 'easy' },

  // More medium
  { id: 70, title: '温馨一周', description: '这周互动60次', type: 'action_any_count', target: 60, reward_points: 15, difficulty: 'medium' },
  { id: 71, title: '爆发一周', description: '这周互动200次', type: 'action_any_count', target: 200, reward_points: 30, difficulty: 'hard' },

  // More custom
  { id: 80, title: '对方最好看的时刻', description: '描述你觉得对方最好看的一个瞬间', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 81, title: '私房歌单', description: '推荐3首让你想起对方的歌，并说为什么', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 82, title: '道歉时刻', description: '写一件你一直想跟对方说抱歉的事', type: 'custom_response', target: 1, reward_points: 20, difficulty: 'hard' },
  { id: 83, title: '最感动的事', description: '写下对方做过最让你感动的一件事', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
  { id: 84, title: '你的超能力', description: '如果对方有一个超能力，你觉得会是什么？为什么？', type: 'custom_response', target: 1, reward_points: 15, difficulty: 'hard' },
];

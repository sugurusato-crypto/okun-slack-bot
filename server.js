require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Gemini API クライアント
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==========================================
// ツール定義（Function Declarations）
// ==========================================
const tools = [{
  functionDeclarations: [
    {
      name: "addTask",
      description: "新しいタスクを追加する。ユーザーがタスクの追加を依頼した時に使用する。",
      parameters: {
        type: "OBJECT",
        properties: {
          task: {
            type: "STRING",
            description: "タスクの内容・名前"
          },
          assignee: {
            type: "STRING",
            description: "担当者名（佐藤、太陽、シュン、大輝、河原、傑など）"
          },
          deadline: {
            type: "STRING",
            description: "期限（例: 12/15, 12/20 18:00）"
          },
          priority: {
            type: "STRING",
            enum: ["urgent", "thisWeek"],
            description: "優先度: urgent（緊急）またはthisWeek（今週）"
          },
          project: {
            type: "STRING",
            description: "プロジェクト名（任意）"
          }
        },
        required: ["task"]
      }
    },
    {
      name: "completeTask",
      description: "タスクを完了にする。ユーザーがタスクの完了を報告した時に使用する。",
      parameters: {
        type: "OBJECT",
        properties: {
          taskId: {
            type: "NUMBER",
            description: "完了するタスクのID番号"
          },
          taskName: {
            type: "STRING",
            description: "タスク名で検索して完了にする（IDがわからない場合）"
          }
        }
      }
    },
    {
      name: "deleteTask",
      description: "タスクを削除する。ユーザーがタスクの削除を依頼した時に使用する。",
      parameters: {
        type: "OBJECT",
        properties: {
          taskId: {
            type: "NUMBER",
            description: "削除するタスクのID番号"
          },
          taskName: {
            type: "STRING",
            description: "タスク名で検索して削除する（IDがわからない場合）"
          }
        }
      }
    },
    {
      name: "listTasks",
      description: "タスク一覧を取得する。ユーザーがタスクの確認・表示を依頼した時に使用する。",
      parameters: {
        type: "OBJECT",
        properties: {
          filter: {
            type: "STRING",
            enum: ["all", "urgent", "thisWeek", "completed", "byAssignee"],
            description: "フィルター: all（全て）, urgent（緊急のみ）, thisWeek（今週のみ）, completed（完了済み）, byAssignee（担当者別）"
          },
          assignee: {
            type: "STRING",
            description: "担当者でフィルターする場合の担当者名"
          }
        }
      }
    },
    {
      name: "searchTasks",
      description: "タスクを検索する。キーワードでタスクを探す時に使用する。",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "検索キーワード"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "updateTaskStatus",
      description: "タスクのステータスを更新する。進捗状況を変更する時に使用する。",
      parameters: {
        type: "OBJECT",
        properties: {
          taskId: {
            type: "NUMBER",
            description: "更新するタスクのID番号"
          },
          status: {
            type: "STRING",
            enum: ["未着手", "進行中", "レビュー中", "完了"],
            description: "新しいステータス"
          }
        },
        required: ["taskId", "status"]
      }
    },
    {
      name: "sendReminder",
      description: "特定のメンバーにリマインダーDMを送信する",
      parameters: {
        type: "OBJECT",
        properties: {
          assignee: {
            type: "STRING",
            description: "リマインダーを送る担当者名"
          },
          message: {
            type: "STRING",
            description: "リマインダーメッセージ（任意、なければ自動生成）"
          }
        },
        required: ["assignee"]
      }
    },
    {
      name: "getChannelHistory",
      description: "Slackチャンネルの最近のメッセージ履歴を取得する。「#generalのログ見せて」「最近の会話教えて」などの依頼時に使用。",
      parameters: {
        type: "OBJECT",
        properties: {
          channelName: {
            type: "STRING",
            description: "チャンネル名（#なしで指定、例: general, random, project-x）"
          },
          limit: {
            type: "NUMBER",
            description: "取得するメッセージ数（デフォルト: 20、最大: 50）"
          }
        },
        required: ["channelName"]
      }
    },
    {
      name: "searchMessages",
      description: "Slackワークスペース内のメッセージを検索する。「〜について言ってたやつ探して」「〜のメッセージ検索して」などの依頼時に使用。",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "検索クエリ（キーワード、from:ユーザー名、in:チャンネル名 などの修飾子も使用可能）"
          },
          limit: {
            type: "NUMBER",
            description: "取得する結果数（デフォルト: 10、最大: 30）"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "readThread",
      description: "特定のSlackスレッドの内容を読み取る。スレッドURLやthread_tsが提供された場合に使用。「このスレッドの内容まとめて」などの依頼時に使用。",
      parameters: {
        type: "OBJECT",
        properties: {
          channelId: {
            type: "STRING",
            description: "チャンネルID（例: C01ABC123）"
          },
          threadTs: {
            type: "STRING",
            description: "スレッドのタイムスタンプ（例: 1234567890.123456）"
          },
          limit: {
            type: "NUMBER",
            description: "取得するメッセージ数（デフォルト: 30、最大: 100）"
          }
        },
        required: ["channelId", "threadTs"]
      }
    }
  ]
}];

// Geminiモデル（Function Calling対応）
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: tools,
  systemInstruction: `あなたは「オーくん」、Uravation株式会社のフレンドリーなAIアシスタントです。
チームメンバー（佐藤、太陽、シュン、大輝、河原、傑など）のタスク管理をサポートします。

【性格・話し方】
- 明るくてフレンドリー、でも仕事もしっかりできる
- 敬語は使わず、タメ口でカジュアルに話す
- 「〜だよ」「〜だね」「〜かな？」などの口調
- 適度に絵文字を使う
- 共感力が高く、相手の気持ちに寄り添う

【できること】
- タスクの追加・削除・完了・検索（ツールを使って実行）
- タスク管理の相談やアドバイス
- 雑談や相談相手
- アイデア出しのサポート
- 励ましや応援
- リマインダー送信
- Slackチャンネルの履歴を見る（「#generalのログ見せて」）
- Slackメッセージの検索（「〜について言ってたやつ探して」）
- スレッドの内容を読む（URLを貼られた時など）

【大切にしていること】
- ユーザーの話をちゃんと聞く
- 押し付けがましくならない
- 具体的で実用的なアドバイス
- ポジティブな雰囲気を大切に

あなたはエージェントとして、ユーザーの依頼に応じて適切なツール（関数）を呼び出してタスク操作を実行できるよ。
複数のツールを組み合わせて使うこともできるし、雑談だけでもOK！
回答はSlack向けに簡潔に、見やすくしてね。

【絶対守ること】
- アスタリスク（ * や ** ）は絶対に使わない！Slackでは反映されないから。
- 強調したい場合は絵文字や「」を使う。
- 箇条書きは「•」や「-」を使う。`
});

// タスクファイルのパス（永続化用）
const TASKS_FILE = path.join(__dirname, 'tasks.json');

// ==========================================
// ユーザー別会話履歴管理
// ==========================================
const CONVERSATIONS_DIR = path.join(__dirname, 'conversations');
const LEARNINGS_FILE = path.join(__dirname, 'learnings.json');
const MAX_HISTORY_PER_USER = 50; // ユーザーごとの最大履歴数
const THREAD_HISTORY_LIMIT = 30; // スレッド履歴の取得件数
const USER_CONTEXT_LIMIT = 15; // コンテキストに含めるユーザー履歴件数

// conversationsディレクトリがなければ作成
if (!fs.existsSync(CONVERSATIONS_DIR)) {
  fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
}

// ユーザー別会話履歴を読み込む
function loadUserConversation(userId) {
  const filePath = path.join(CONVERSATIONS_DIR, `${userId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`Failed to load conversation for ${userId}:`, e);
  }
  return {
    userId: userId,
    userName: null,
    messages: [],
    preferences: {},
    lastInteraction: null
  };
}

// ユーザー別会話履歴を保存
function saveUserConversation(userId, data) {
  const filePath = path.join(CONVERSATIONS_DIR, `${userId}.json`);
  try {
    // 最大履歴数を超えたら古いものを削除
    if (data.messages.length > MAX_HISTORY_PER_USER) {
      data.messages = data.messages.slice(-MAX_HISTORY_PER_USER);
    }
    data.lastInteraction = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`Failed to save conversation for ${userId}:`, e);
  }
}

// 会話を追加
function addToUserHistory(userId, userName, role, content, context = {}) {
  const data = loadUserConversation(userId);
  if (userName && !data.userName) {
    data.userName = userName;
  }
  data.messages.push({
    role: role, // 'user' or 'assistant'
    content: content,
    timestamp: new Date().toISOString(),
    context: context // channel, thread_ts など
  });
  saveUserConversation(userId, data);
  return data;
}

// ユーザーの最近の会話履歴を取得（コンテキスト用）
function getUserRecentHistory(userId, limit = 10) {
  const data = loadUserConversation(userId);
  return data.messages.slice(-limit);
}

// ==========================================
// 匿名化学習データ
// ==========================================
function loadLearnings() {
  try {
    if (fs.existsSync(LEARNINGS_FILE)) {
      return JSON.parse(fs.readFileSync(LEARNINGS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load learnings:', e);
  }
  return {
    patterns: [], // よくある質問パターン
    insights: [], // 学んだこと
    updatedAt: null
  };
}

function saveLearnings(data) {
  try {
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(LEARNINGS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save learnings:', e);
  }
}

// 学びを追加（匿名化済みの洞察のみ）
function addLearning(type, content) {
  const learnings = loadLearnings();
  if (type === 'pattern') {
    // 重複チェック
    if (!learnings.patterns.includes(content)) {
      learnings.patterns.push(content);
      if (learnings.patterns.length > 100) {
        learnings.patterns = learnings.patterns.slice(-100);
      }
    }
  } else if (type === 'insight') {
    learnings.insights.push({
      content: content,
      addedAt: new Date().toISOString()
    });
    if (learnings.insights.length > 50) {
      learnings.insights = learnings.insights.slice(-50);
    }
  }
  saveLearnings(learnings);
}

// ==========================================
// 統一コンテキスト取得関数
// ==========================================
async function getUnifiedContext(options) {
  const {
    userId,
    userName,
    channel,
    threadTs,
    messageTs,
    currentMessage
  } = options;

  let contextParts = [];

  // 1. スレッド履歴を取得（threadTsがある場合）
  if (threadTs && channel) {
    try {
      const repliesRes = await fetch(
        `https://slack.com/api/conversations.replies?channel=${channel}&ts=${threadTs}&limit=${THREAD_HISTORY_LIMIT}`,
        { headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` } }
      );
      const repliesData = await repliesRes.json();

      if (repliesData.ok && repliesData.messages && repliesData.messages.length > 0) {
        const userNameCache = {};
        const threadHistory = [];

        for (const msg of repliesData.messages) {
          // 現在のメッセージはスキップ
          if (msg.ts === messageTs) continue;

          let msgUserName = 'ユーザー';
          if (msg.user) {
            if (userNameCache[msg.user]) {
              msgUserName = userNameCache[msg.user];
            } else {
              try {
                const msgUserRes = await fetch(`https://slack.com/api/users.info?user=${msg.user}`, {
                  headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
                });
                const msgUserInfo = await msgUserRes.json();
                if (msgUserInfo.ok) {
                  msgUserName = msgUserInfo.user.real_name || msgUserInfo.user.name;
                  userNameCache[msg.user] = msgUserName;
                }
              } catch (e) {
                console.log(`[Context] Failed to get user name for ${msg.user}`);
              }
            }
          } else if (msg.bot_id) {
            msgUserName = 'オーくん';
          }

          const cleanMsgText = (msg.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
          if (cleanMsgText) {
            threadHistory.push(`${msgUserName}: ${cleanMsgText}`);
          }
        }

        if (threadHistory.length > 0) {
          contextParts.push(`【このスレッドの会話履歴（${threadHistory.length}件）】\n${threadHistory.join('\n')}`);
        }
      }
    } catch (error) {
      console.error('[Context] Error fetching thread history:', error);
    }
  }

  // 2. ユーザーの過去の会話履歴を取得
  const recentHistory = getUserRecentHistory(userId, USER_CONTEXT_LIMIT);
  if (recentHistory.length > 0) {
    const historyText = recentHistory.map(h =>
      `${h.role === 'user' ? userName : 'オーくん'}: ${h.content.substring(0, 150)}${h.content.length > 150 ? '...' : ''}`
    ).join('\n');
    contextParts.push(`【${userName}さんとの過去の会話（${recentHistory.length}件）】\n${historyText}`);
  }

  // 3. 現在のタスク状況
  const taskContext = `【現在のタスク状況】
緊急タスク: ${tasks.urgent.length}件
${tasks.urgent.map(t => `  [${t.id}] ${t.task} (担当:${t.assignee}, 期限:${t.deadline})`).join('\n')}

今週のタスク: ${tasks.thisWeek.length}件
${tasks.thisWeek.map(t => `  [${t.id}] ${t.task} (担当:${t.assignee}, 期限:${t.deadline})`).join('\n')}`;
  contextParts.push(taskContext);

  // 4. 現在のメッセージ
  contextParts.push(`【${userName}さんの今のメッセージ】\n${currentMessage}`);

  return contextParts.join('\n\n');
}

// スレッドリンクからthread_tsを抽出する関数
function extractThreadTsFromUrl(url) {
  const permalinkMatch = url.match(/\/p(\d{10})(\d{6})?/);
  if (permalinkMatch) {
    return permalinkMatch[1] + '.' + (permalinkMatch[2] || '000000');
  }
  return null;
}

// スレッドリンクとチャンネルIDを抽出
function extractSlackLinkInfo(text) {
  const slackLinkMatch = text?.match(/<(https:\/\/[^|>]+\.slack\.com\/archives\/([^/|>]+)\/p[^|>]+)(\|[^>]*)?>/) ||
                         text?.match(/(https:\/\/[^\s]+\.slack\.com\/archives\/([^/\s]+)\/p[^\s]+)/);

  if (slackLinkMatch) {
    const url = slackLinkMatch[1];
    const channelId = slackLinkMatch[2];
    const threadTs = extractThreadTsFromUrl(url);
    const cleanText = text.replace(slackLinkMatch[0], '').trim();
    return { url, channelId, threadTs, cleanText, hasLink: true };
  }

  return { cleanText: text, hasLink: false };
}

// CEO（佐藤）のSlack ID
const CEO_SLACK_ID = 'U06MXBSJKC3';

// メンバーマッピング
const MEMBER_SLACK_IDS = {
  '佐藤': 'U06MXBSJKC3',
  '傑': 'U06MXBSJKC3',
  '大輝': 'U09N2NA1UTW',
  '河原': 'U098D4VNTV1',
  '太陽': 'U06MXBSJKC3',
  'シュン': 'U06MXBSJKC3',
  '木口': 'U06P9BL4XGA',
  '福本': 'U06THQJEPH8',
  '岩本': 'U074YSZ9UJ2',
  '中本': 'U098HS2GK6E',
  '馬目': 'U09N8R5T4QY',
  '甲': 'U09T74ZCEK1',
  'daiki': 'U09T74ZCEK1',
  'Daiki': 'U09T74ZCEK1',
  'yusei': 'U09V1JZHKGQ',
  'Yusei': 'U09V1JZHKGQ',
};

// タスクを読み込む
function loadTasks() {
  try {
    if (fs.existsSync(TASKS_FILE)) {
      return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load tasks:', e);
  }
  return {
    urgent: [],
    thisWeek: [],
    completed: []
  };
}

function saveTasks(tasksData) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksData, null, 2));
}

function getNextId(tasksData) {
  const allTasks = [...tasksData.urgent, ...tasksData.thisWeek, ...tasksData.completed];
  return Math.max(...allTasks.map(t => t.id || 0), 0) + 1;
}

let tasks = loadTasks();

// ==========================================
// ツール実行関数
// ==========================================

function executeAddTask(args) {
  const newTask = {
    id: getNextId(tasks),
    task: args.task,
    assignee: args.assignee || '-',
    project: args.project || '未分類',
    deadline: args.deadline || '未定',
    status: '未着手',
    createdAt: new Date().toISOString()
  };

  if (args.priority === 'urgent') {
    tasks.urgent.push(newTask);
  } else {
    tasks.thisWeek.push(newTask);
  }
  saveTasks(tasks);

  return {
    success: true,
    message: `タスク「${newTask.task}」を追加しました`,
    task: newTask
  };
}

function executeCompleteTask(args) {
  let foundTask = null;

  // IDで検索
  if (args.taskId) {
    for (const list of ['urgent', 'thisWeek']) {
      const idx = tasks[list].findIndex(t => t.id === args.taskId);
      if (idx !== -1) {
        foundTask = tasks[list].splice(idx, 1)[0];
        break;
      }
    }
  }
  // 名前で検索
  else if (args.taskName) {
    for (const list of ['urgent', 'thisWeek']) {
      const idx = tasks[list].findIndex(t =>
        t.task.toLowerCase().includes(args.taskName.toLowerCase())
      );
      if (idx !== -1) {
        foundTask = tasks[list].splice(idx, 1)[0];
        break;
      }
    }
  }

  if (foundTask) {
    foundTask.status = '完了';
    foundTask.completedAt = new Date().toISOString();
    tasks.completed.push(foundTask);
    saveTasks(tasks);
    return {
      success: true,
      message: `タスク「${foundTask.task}」を完了にしました`,
      task: foundTask
    };
  }

  return {
    success: false,
    message: `タスクが見つかりませんでした`
  };
}

function executeDeleteTask(args) {
  let deletedTask = null;

  // IDで検索
  if (args.taskId) {
    for (const list of ['urgent', 'thisWeek', 'completed']) {
      const idx = tasks[list].findIndex(t => t.id === args.taskId);
      if (idx !== -1) {
        deletedTask = tasks[list].splice(idx, 1)[0];
        break;
      }
    }
  }
  // 名前で検索
  else if (args.taskName) {
    for (const list of ['urgent', 'thisWeek', 'completed']) {
      const idx = tasks[list].findIndex(t =>
        t.task.toLowerCase().includes(args.taskName.toLowerCase())
      );
      if (idx !== -1) {
        deletedTask = tasks[list].splice(idx, 1)[0];
        break;
      }
    }
  }

  if (deletedTask) {
    saveTasks(tasks);
    return {
      success: true,
      message: `タスク「${deletedTask.task}」を削除しました`,
      task: deletedTask
    };
  }

  return {
    success: false,
    message: `タスクが見つかりませんでした`
  };
}

function executeListTasks(args) {
  const filter = args?.filter || 'all';
  const assignee = args?.assignee;

  let result = {
    urgent: [],
    thisWeek: [],
    completed: []
  };

  switch (filter) {
    case 'urgent':
      result.urgent = tasks.urgent;
      break;
    case 'thisWeek':
      result.thisWeek = tasks.thisWeek;
      break;
    case 'completed':
      result.completed = tasks.completed.slice(-10);
      break;
    case 'byAssignee':
      if (assignee) {
        result.urgent = tasks.urgent.filter(t => t.assignee === assignee);
        result.thisWeek = tasks.thisWeek.filter(t => t.assignee === assignee);
      }
      break;
    default:
      result = {
        urgent: tasks.urgent,
        thisWeek: tasks.thisWeek,
        completed: tasks.completed.slice(-5)
      };
  }

  return {
    success: true,
    tasks: result,
    summary: {
      urgentCount: result.urgent.length,
      thisWeekCount: result.thisWeek.length,
      completedCount: result.completed.length
    }
  };
}

function executeSearchTasks(args) {
  const query = args.query.toLowerCase();
  const allTasks = [...tasks.urgent, ...tasks.thisWeek, ...tasks.completed];

  const found = allTasks.filter(t =>
    t.task.toLowerCase().includes(query) ||
    (t.assignee && t.assignee.toLowerCase().includes(query)) ||
    (t.project && t.project.toLowerCase().includes(query))
  );

  return {
    success: true,
    query: args.query,
    results: found,
    count: found.length
  };
}

function executeUpdateTaskStatus(args) {
  let foundTask = null;

  for (const list of ['urgent', 'thisWeek']) {
    const task = tasks[list].find(t => t.id === args.taskId);
    if (task) {
      task.status = args.status;
      foundTask = task;
      break;
    }
  }

  if (foundTask) {
    saveTasks(tasks);
    return {
      success: true,
      message: `タスク「${foundTask.task}」のステータスを「${args.status}」に更新しました`,
      task: foundTask
    };
  }

  return {
    success: false,
    message: `タスクID ${args.taskId} が見つかりませんでした`
  };
}

async function executeSendReminder(args) {
  const slackId = MEMBER_SLACK_IDS[args.assignee];
  if (!slackId) {
    return {
      success: false,
      message: `${args.assignee}さんのSlack IDが登録されていません`
    };
  }

  // 担当者のタスクを取得
  const assigneeTasks = [...tasks.urgent, ...tasks.thisWeek].filter(
    t => t.assignee === args.assignee
  );

  const message = args.message ||
    `📋 ${args.assignee}さん、タスクのリマインドです！\n` +
    assigneeTasks.map(t => `• ${t.task}（期限: ${t.deadline}）`).join('\n');

  const sent = await sendSlackDM(slackId, message);

  return {
    success: sent,
    message: sent
      ? `${args.assignee}さんにリマインダーを送信しました`
      : `リマインダーの送信に失敗しました`
  };
}

// チャンネル履歴を取得
async function executeGetChannelHistory(args) {
  const channelName = args.channelName.replace(/^#/, '');
  const limit = Math.min(args.limit || 20, 50);

  try {
    // チャンネル一覧からIDを取得
    const listRes = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200', {
      headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
    });
    const listData = await listRes.json();

    if (!listData.ok) {
      return { success: false, message: `チャンネル一覧の取得に失敗: ${listData.error}` };
    }

    const channel = listData.channels.find(c =>
      c.name.toLowerCase() === channelName.toLowerCase()
    );

    if (!channel) {
      return { success: false, message: `チャンネル「#${channelName}」が見つかりませんでした` };
    }

    // チャンネル履歴を取得
    const historyRes = await fetch(`https://slack.com/api/conversations.history?channel=${channel.id}&limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
    });
    const historyData = await historyRes.json();

    if (!historyData.ok) {
      return { success: false, message: `履歴の取得に失敗: ${historyData.error}` };
    }

    // ユーザー名キャッシュ
    const userCache = {};

    // メッセージを整形
    const messages = [];
    for (const msg of historyData.messages.reverse()) {
      let userName = 'ユーザー';
      if (msg.user) {
        if (userCache[msg.user]) {
          userName = userCache[msg.user];
        } else {
          try {
            const userRes = await fetch(`https://slack.com/api/users.info?user=${msg.user}`, {
              headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
            });
            const userData = await userRes.json();
            if (userData.ok) {
              userName = userData.user.real_name || userData.user.name;
              userCache[msg.user] = userName;
            }
          } catch (e) {}
        }
      } else if (msg.bot_id) {
        userName = 'Bot';
      }

      const timestamp = new Date(parseFloat(msg.ts) * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
      messages.push({
        user: userName,
        text: msg.text?.substring(0, 300) || '',
        timestamp: timestamp,
        hasThread: !!msg.thread_ts
      });
    }

    return {
      success: true,
      channelName: `#${channel.name}`,
      messageCount: messages.length,
      messages: messages
    };
  } catch (error) {
    console.error('[getChannelHistory] Error:', error);
    return { success: false, message: `エラー: ${error.message}` };
  }
}

// メッセージを検索
async function executeSearchMessages(args) {
  const query = args.query;
  const limit = Math.min(args.limit || 10, 30);

  try {
    const searchRes = await fetch(`https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=${limit}`, {
      headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
    });
    const searchData = await searchRes.json();

    if (!searchData.ok) {
      return { success: false, message: `検索に失敗: ${searchData.error}` };
    }

    if (!searchData.messages?.matches || searchData.messages.matches.length === 0) {
      return { success: true, query: query, resultCount: 0, results: [], message: '検索結果がありませんでした' };
    }

    const results = searchData.messages.matches.map(match => ({
      user: match.username || 'ユーザー',
      text: match.text?.substring(0, 300) || '',
      channel: match.channel?.name || 'unknown',
      timestamp: new Date(parseFloat(match.ts) * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      permalink: match.permalink
    }));

    return {
      success: true,
      query: query,
      resultCount: results.length,
      totalMatches: searchData.messages.total,
      results: results
    };
  } catch (error) {
    console.error('[searchMessages] Error:', error);
    return { success: false, message: `エラー: ${error.message}` };
  }
}

// スレッドを読み取る
async function executeReadThread(args) {
  const { channelId, threadTs } = args;
  const limit = Math.min(args.limit || 30, 100);

  try {
    const repliesRes = await fetch(`https://slack.com/api/conversations.replies?channel=${channelId}&ts=${threadTs}&limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
    });
    const repliesData = await repliesRes.json();

    if (!repliesData.ok) {
      return { success: false, message: `スレッドの取得に失敗: ${repliesData.error}` };
    }

    if (!repliesData.messages || repliesData.messages.length === 0) {
      return { success: false, message: 'スレッドが見つかりませんでした' };
    }

    // ユーザー名キャッシュ
    const userCache = {};

    const messages = [];
    for (const msg of repliesData.messages) {
      let userName = 'ユーザー';
      if (msg.user) {
        if (userCache[msg.user]) {
          userName = userCache[msg.user];
        } else {
          try {
            const userRes = await fetch(`https://slack.com/api/users.info?user=${msg.user}`, {
              headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
            });
            const userData = await userRes.json();
            if (userData.ok) {
              userName = userData.user.real_name || userData.user.name;
              userCache[msg.user] = userName;
            }
          } catch (e) {}
        }
      } else if (msg.bot_id) {
        userName = 'Bot';
      }

      const timestamp = new Date(parseFloat(msg.ts) * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
      messages.push({
        user: userName,
        text: msg.text || '',
        timestamp: timestamp
      });
    }

    return {
      success: true,
      channelId: channelId,
      threadTs: threadTs,
      messageCount: messages.length,
      messages: messages
    };
  } catch (error) {
    console.error('[readThread] Error:', error);
    return { success: false, message: `エラー: ${error.message}` };
  }
}

// ツール実行のディスパッチャー
async function executeTool(name, args) {
  console.log(`[Agent] Executing tool: ${name}`, args);

  switch (name) {
    case 'addTask':
      return executeAddTask(args);
    case 'completeTask':
      return executeCompleteTask(args);
    case 'deleteTask':
      return executeDeleteTask(args);
    case 'listTasks':
      return executeListTasks(args);
    case 'searchTasks':
      return executeSearchTasks(args);
    case 'updateTaskStatus':
      return executeUpdateTaskStatus(args);
    case 'sendReminder':
      return await executeSendReminder(args);
    case 'getChannelHistory':
      return await executeGetChannelHistory(args);
    case 'searchMessages':
      return await executeSearchMessages(args);
    case 'readThread':
      return await executeReadThread(args);
    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}

// ==========================================
// エージェントループ
// ==========================================
async function runAgent(unifiedContext, userId, userName) {
  console.log(`[Agent] Starting for user: ${userName}`);
  console.log(`[Agent] Context length: ${unifiedContext.length} chars`);

  // チャット履歴を構築
  const chat = model.startChat({
    history: [],
  });

  // 統一コンテキストをそのまま使用
  const fullMessage = unifiedContext;

  let response = await chat.sendMessage(fullMessage);
  let result = response.response;

  // エージェントループ: ツール呼び出しがある限り続ける
  let loopCount = 0;
  const maxLoops = 10; // 無限ループ防止

  while (loopCount < maxLoops) {
    loopCount++;

    // Function Callがあるかチェック
    const functionCalls = result.candidates?.[0]?.content?.parts?.filter(
      part => part.functionCall
    );

    if (!functionCalls || functionCalls.length === 0) {
      // ツール呼び出しなし = 最終回答
      break;
    }

    console.log(`[Agent] Loop ${loopCount}: ${functionCalls.length} function call(s)`);

    // 各ツールを実行
    const toolResults = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      const toolResult = await executeTool(name, args);
      toolResults.push({
        functionResponse: {
          name: name,
          response: toolResult
        }
      });
    }

    // ツール結果をGeminiに送信
    response = await chat.sendMessage(toolResults);
    result = response.response;
  }

  // 最終的なテキスト回答を取得
  const textParts = result.candidates?.[0]?.content?.parts?.filter(
    part => part.text
  );

  let finalText = textParts?.map(p => p.text).join('\n') || 'すみません、うまく処理できませんでした。';

  // Slack向けにアスタリスクを除去（Geminiが守らないことがあるため強制）
  finalText = cleanSlackFormatting(finalText);

  console.log(`[Agent] Completed. Loops: ${loopCount}`);
  return finalText;
}

// Slack向けフォーマット整形（アスタリスク除去）
function cleanSlackFormatting(text) {
  return text
    // **太字** → 「太字」に変換
    .replace(/\*\*([^*]+)\*\*/g, '「$1」')
    // *イタリック* → そのままテキストに
    .replace(/\*([^*]+)\*/g, '$1')
    // 残った単独アスタリスクを除去
    .replace(/\*/g, '');
}

// ==========================================
// スレッド会話用エージェント
// ==========================================
async function runAgentForThread(userMessage, userName, conversationHistory) {
  console.log(`[ThreadAgent] Starting conversation for ${userName}`);

  // 会話専用モデル（ツールなし、より自然な会話向け）
  const chatModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: `あなたは「オーくん」、Uravation株式会社のフレンドリーなAIアシスタントです。

【性格・話し方】
- 明るくてフレンドリー、でも仕事もしっかりできる
- 敬語は使わず、タメ口でカジュアルに話す
- 「〜だよ」「〜だね」「〜かな？」などの口調
- 適度に絵文字を使う
- 共感力が高く、相手の気持ちに寄り添う

【できること】
- タスク管理の相談やアドバイス
- 雑談や相談相手
- アイデア出しのサポート
- 励ましや応援

【大切にしていること】
- ユーザーの話をちゃんと聞く
- 押し付けがましくならない
- 具体的で実用的なアドバイス
- ポジティブな雰囲気を大切に

【絶対守ること】
- アスタリスク（ * や ** ）は絶対に使わない！Slackでは反映されないから。
- 強調したい場合は絵文字や「」を使う。
- 箇条書きは「•」や「-」を使う。

質問されたら答えて、雑談なら楽しく話して、相談なら一緒に考えてあげてね。`
  });

  const chat = chatModel.startChat({
    history: [],
  });

  // 会話コンテキストを構築
  const contextMessage = `【これまでの会話】
${conversationHistory}

【${userName}さんの最新メッセージ】
${userMessage}

上記の会話の流れを踏まえて、自然に返答してください。`;

  try {
    const response = await chat.sendMessage(contextMessage);
    const result = response.response;

    const textParts = result.candidates?.[0]?.content?.parts?.filter(
      part => part.text
    );

    let finalText = textParts?.map(p => p.text).join('\n') || 'ごめん、ちょっとうまく返せなかった...もう一回言ってもらえる？';

    // Slack向けにアスタリスクを除去
    finalText = cleanSlackFormatting(finalText);

    console.log(`[ThreadAgent] Response generated for ${userName}`);
    return finalText;
  } catch (error) {
    console.error('[ThreadAgent] Error:', error);
    return 'あれ、なんかエラーになっちゃった...ごめんね 🙏';
  }
}

// ==========================================
// Slack関連
// ==========================================

async function sendSlackDM(userId, message) {
  try {
    const openRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ users: userId })
    });
    const openData = await openRes.json();

    if (!openData.ok) {
      console.error('Failed to open DM:', openData.error);
      return false;
    }

    const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: openData.channel.id,
        text: message
      })
    });
    const msgData = await msgRes.json();

    if (!msgData.ok) {
      console.error('Failed to send DM:', msgData.error);
      return false;
    }

    console.log(`DM sent to ${userId}`);
    return true;
  } catch (error) {
    console.error('DM Error:', error);
    return false;
  }
}

async function sendDelayedResponse(response_url, text) {
  try {
    const response = await fetch(response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'in_channel',
        text: text
      })
    });
    console.log('Delayed response sent:', response.status);
  } catch (error) {
    console.error('Failed to send delayed response:', error);
  }
}

// 期限チェックとリマインド送信
async function checkDeadlinesAndRemind() {
  console.log('Checking deadlines...');

  const now = new Date();
  const allTasks = [...tasks.urgent, ...tasks.thisWeek];
  const tasksByAssignee = {};

  for (const task of allTasks) {
    if (task.status === '完了' || task.assignee === '-') continue;

    const deadlineStr = task.deadline;
    const match = deadlineStr.match(/(\d+)\/(\d+)/);
    if (!match) continue;

    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    const deadlineDate = new Date(now.getFullYear(), month - 1, day);
    const daysUntil = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 2 && daysUntil >= 0) {
      if (!tasksByAssignee[task.assignee]) {
        tasksByAssignee[task.assignee] = [];
      }
      tasksByAssignee[task.assignee].push(task);
    }
  }

  const sentReminders = [];

  for (const [assignee, taskList] of Object.entries(tasksByAssignee)) {
    const slackId = MEMBER_SLACK_IDS[assignee];
    if (!slackId) continue;

    const message = `📋 ${assignee}さん、お疲れさまです！\n期限が近いタスクがあります:\n${taskList.map(t => `• ${t.task}（${t.deadline}）`).join('\n')}\nファイトです！💪`;
    const sent = await sendSlackDM(slackId, message);

    if (sent && slackId !== CEO_SLACK_ID) {
      sentReminders.push({
        assignee,
        tasks: taskList.map(t => t.task)
      });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  if (sentReminders.length > 0) {
    const reportLines = sentReminders.map(r =>
      `• ${r.assignee}さん: ${r.tasks.join(', ')}`
    );
    const ceoReport = `📬 リマインド送信報告\n\n以下のメンバーにリマインドDMを送信しました:\n${reportLines.join('\n')}`;
    await sendSlackDM(CEO_SLACK_ID, ceoReport);
  }

  console.log('Reminder check completed');
}

// ==========================================
// APIエンドポイント
// ==========================================

// Slack Slash Command ハンドラー
app.post('/slack/command', async (req, res) => {
  const { text, user_name, user_id, command, response_url, channel_id } = req.body;
  console.log(`[Slash] Command: ${command}, Text: ${text}, User: ${user_name}, Channel: ${channel_id}`);

  // スレッドリンクを抽出（統一関数を使用）
  const linkInfo = extractSlackLinkInfo(text);
  const threadTs = linkInfo.threadTs;
  const linkedChannel = linkInfo.channelId || channel_id;
  const cleanText = linkInfo.cleanText || '';

  if (linkInfo.hasLink) {
    console.log(`[Slash] Detected thread link - channel: ${linkedChannel}, thread_ts: ${threadTs}`);
  }

  // 即座に処理中メッセージを返す
  res.json({
    response_type: "ephemeral",
    text: `⏳ 処理中...`
  });

  try {
    // 統一コンテキストを取得
    const unifiedContext = await getUnifiedContext({
      userId: user_id,
      userName: user_name,
      channel: linkedChannel,
      threadTs: threadTs,
      messageTs: null,
      currentMessage: cleanText || 'タスク一覧を見せて'
    });

    const agentResponse = await runAgent(unifiedContext, user_id, user_name);

    // 会話履歴に追加
    addToUserHistory(user_id, user_name, 'user', cleanText || 'タスク一覧を見せて', {
      type: 'slash',
      channel: linkedChannel,
      threadTs
    });
    addToUserHistory(user_id, user_name, 'assistant', agentResponse, {
      type: 'slash',
      channel: linkedChannel,
      threadTs
    });

    // スレッドtsがある場合はスレッドに返信、なければチャンネルに投稿
    if (threadTs && linkedChannel) {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel: linkedChannel,
          thread_ts: threadTs,
          text: agentResponse
        })
      });
      console.log(`[Slash] Responded in thread ${threadTs}`);
    } else if (response_url) {
      await sendDelayedResponse(response_url, agentResponse);
    }
  } catch (error) {
    console.error('[Slash] Error:', error);
    if (response_url) {
      await sendDelayedResponse(response_url, `❌ エラーが発生しました: ${error.message}`);
    }
  }
});

// タスク検出用のAI分析関数
async function analyzeForTask(message, userName) {
  const analysisModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
  });

  const prompt = `以下のSlackメッセージを分析して、「実際の作業タスク」として登録すべきかどうか判断してください。

メッセージ: "${message}"
発言者: ${userName}

【タスクとして検出する条件】すべて満たす必要あり：
1. 具体的な「成果物」や「アウトプット」を伴う作業依頼である
2. 期限が明示または暗示されている（「今週中」「明日まで」「来週月曜」など）
3. 「資料作成」「開発」「設計」「準備」「連絡」など実作業を伴う

【タスクではないもの】以下は絶対にタスクとして検出しない：
- 質問や情報の問い合わせ（「〜教えて」「〜見せて」「〜ある？」「〜って何？」）
- AIやボットへの指示・命令（「タスク一覧」「確認して」など）
- 単なる雑談や感想
- 報告・共有のみ（作業依頼なし）
- すでに完了した報告
- 挨拶やリアクション

【重要】
- 「教えて」「見せて」「確認して」は情報要求であり、タスクではない
- 「作りたい」「やりたい」だけでは弱い。期限や成果物が明確な場合のみタスク
- 迷ったらタスクではないと判断する（false positive を避ける）

JSON形式で回答してください：
{
  "isTask": true/false,
  "confidence": 0-100,
  "task": "タスク内容（isTaskがtrueの場合）",
  "assignee": "担当者名（わかる場合、なければnull）",
  "deadline": "期限（わかる場合、なければnull）",
  "reason": "判断理由"
}`;

  try {
    const result = await analysisModel.generateContent(prompt);
    const responseText = result.response.text();

    // JSONを抽出
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { isTask: false, confidence: 0, reason: 'パース失敗' };
  } catch (error) {
    console.error('Task analysis error:', error);
    return { isTask: false, confidence: 0, reason: error.message };
  }
}

// スレッドに返信する関数
async function replyInThread(channel, threadTs, message) {
  console.log(`[replyInThread] Sending to channel: ${channel}, thread: ${threadTs}, message length: ${message?.length || 0}`);
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: channel,
        thread_ts: threadTs,
        text: message
      })
    });
    const result = await response.json();
    console.log(`[replyInThread] Result:`, result.ok ? 'success' : result.error);
    if (!result.ok) {
      console.error('[replyInThread] Full error:', JSON.stringify(result));
    }
    return result.ok;
  } catch (error) {
    console.error('Thread reply error:', error);
    return false;
  }
}

// 処理済みメッセージを追跡（重複防止）
const processedMessages = new Set();

// Slack Events API ハンドラー（DM + チャンネル監視）
app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  // URL検証
  if (type === 'url_verification') {
    return res.json({ challenge });
  }

  // イベントコールバック
  if (type === 'event_callback' && event) {
    // ボット自身のメッセージは無視
    if (event.bot_id || event.subtype === 'bot_message') {
      return res.status(200).send('ok');
    }

    // 重複イベント防止
    const eventId = event.client_msg_id || event.ts;
    if (processedMessages.has(eventId)) {
      return res.status(200).send('ok');
    }
    processedMessages.add(eventId);
    // 古いエントリを削除（メモリリーク防止）
    if (processedMessages.size > 1000) {
      const entries = Array.from(processedMessages);
      entries.slice(0, 500).forEach(e => processedMessages.delete(e));
    }

    // app_mention イベント（ボットが@メンションされた時）
    if (event.type === 'app_mention') {
      const userMessage = event.text;
      const userId = event.user;
      const channel = event.channel;
      const messageTs = event.ts;
      const threadTs = event.thread_ts; // スレッド内でメンションされた場合

      console.log(`[app_mention] User ${userId} mentioned bot: ${userMessage?.substring(0, 50)}...`);
      console.log(`[app_mention] Channel: ${channel}, ts: ${messageTs}, thread_ts: ${threadTs}`);

      // 即座に200を返す
      res.status(200).send('ok');

      try {
        // ユーザー名を取得
        const userInfoRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
          headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
        });
        const userInfo = await userInfoRes.json();
        const userName = userInfo.ok ? (userInfo.user.real_name || userInfo.user.name) : 'ユーザー';

        // メンション部分を除去してクリーンなメッセージを取得
        const cleanMessage = userMessage.replace(/<@[A-Z0-9]+>/g, '').trim() || 'やあ！';

        console.log(`[app_mention] Processing message from ${userName}: ${cleanMessage}`);

        // 統一コンテキストを取得（スレッド履歴 + ユーザー履歴を含む）
        const unifiedContext = await getUnifiedContext({
          userId: userId,
          userName: userName,
          channel: channel,
          threadTs: threadTs,  // スレッド内ならスレッド履歴も取得
          messageTs: messageTs,
          currentMessage: cleanMessage
        });

        // 会話履歴に追加
        addToUserHistory(userId, userName, 'user', cleanMessage, {
          type: 'mention',
          channel,
          threadTs: threadTs || messageTs
        });

        // エージェントで応答を生成（統一コンテキスト使用）
        const agentResponse = await runAgent(unifiedContext, userId, userName);

        // 会話履歴に追加（アシスタント応答）
        addToUserHistory(userId, userName, 'assistant', agentResponse, {
          type: 'mention',
          channel,
          threadTs: threadTs || messageTs
        });

        // スレッドに返信（thread_tsがあればそのスレッド、なければ新しいスレッドを作成）
        await replyInThread(channel, threadTs || messageTs, agentResponse);
        console.log(`[app_mention] Response sent to thread ${threadTs || messageTs}`);

      } catch (error) {
        console.error('[app_mention] Error:', error);
        await replyInThread(channel, threadTs || messageTs, `❌ ごめん、エラーが発生しちゃった: ${error.message}`);
      }

      return;
    }

    // DMでのメッセージイベント
    if (event.type === 'message' && event.channel_type === 'im') {
      const userMessage = event.text;
      const userId = event.user;
      const channel = event.channel;
      const messageTs = event.ts;

      console.log(`[DM] from ${userId}: ${userMessage}`);

      // 即座に200を返す（3秒タイムアウト対策）
      res.status(200).send('ok');

      try {
        // ユーザー名を取得
        const userInfoRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
          headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
        });
        const userInfo = await userInfoRes.json();
        const userName = userInfo.ok ? (userInfo.user.real_name || userInfo.user.name) : 'ユーザー';

        // 統一コンテキストを取得（DMなのでスレッド履歴はないが、ユーザー履歴は含まれる）
        const unifiedContext = await getUnifiedContext({
          userId: userId,
          userName: userName,
          channel: channel,
          threadTs: null,  // DMにはスレッドなし
          messageTs: messageTs,
          currentMessage: userMessage
        });

        // 会話履歴に追加（ユーザーメッセージ）
        addToUserHistory(userId, userName, 'user', userMessage, { type: 'dm', channel });

        // エージェントを実行（統一コンテキスト使用）
        const agentResponse = await runAgent(unifiedContext, userId, userName);

        // 会話履歴に追加（アシスタント応答）
        addToUserHistory(userId, userName, 'assistant', agentResponse, { type: 'dm', channel });

        // DMに返信
        await sendSlackDM(userId, agentResponse);

      } catch (error) {
        console.error('[DM] processing error:', error);
        await sendSlackDM(userId, `❌ エラーが発生しました: ${error.message}`);
      }

      return;
    }

    // チャンネルでのメッセージイベント（タスク検出 + スレッド会話）
    if (event.type === 'message' && event.channel_type === 'channel') {
      const userMessage = event.text;
      const userId = event.user;
      const channel = event.channel;
      const messageTs = event.ts;
      const threadTs = event.thread_ts; // スレッド返信の場合は親メッセージのts

      // 短すぎるメッセージは無視
      if (!userMessage || userMessage.length < 5) {
        return res.status(200).send('ok');
      }

      // 即座に200を返す
      res.status(200).send('ok');

      try {
        // ユーザー名を取得
        const userInfoRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
          headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
        });
        const userInfo = await userInfoRes.json();
        const userName = userInfo.ok ? (userInfo.user.real_name || userInfo.user.name) : 'ユーザー';

        // スレッド返信の場合 → 条件付きでエージェントで会話
        if (threadTs) {
          console.log(`[Thread] Reply from ${userName}: ${userMessage.substring(0, 50)}...`);

          // ボットがスレッドに参加しているかを確認するためにスレッド履歴を取得
          const historyRes = await fetch(`https://slack.com/api/conversations.replies?channel=${channel}&ts=${threadTs}&limit=10`, {
            headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
          });
          const historyData = await historyRes.json();

          // ボットがすでにスレッドに参加しているかチェック
          let botAlreadyInThread = false;
          if (historyData.ok && historyData.messages) {
            for (const msg of historyData.messages) {
              if (msg.bot_id) {
                botAlreadyInThread = true;
                break;
              }
            }
          }

          // @メンションされているかチェック（「オーくん」または bot user ID）
          const isMentioned = userMessage.includes('オーくん') ||
                              userMessage.includes('@オーくん') ||
                              /<@U[A-Z0-9]+>/.test(userMessage); // Slackのメンション形式

          // ボットが参加済み OR メンションされた場合のみ応答
          if (!botAlreadyInThread && !isMentioned) {
            console.log(`[Thread] Skipping - bot not in thread and not mentioned`);
            return;
          }

          console.log(`[Thread] Responding - botInThread: ${botAlreadyInThread}, mentioned: ${isMentioned}`);

          // 統一コンテキストを取得（スレッド履歴 + ユーザー履歴を含む）
          const unifiedContext = await getUnifiedContext({
            userId: userId,
            userName: userName,
            channel: channel,
            threadTs: threadTs,
            messageTs: messageTs,
            currentMessage: userMessage
          });

          // 会話履歴に追加（ユーザーメッセージ）
          addToUserHistory(userId, userName, 'user', userMessage, { type: 'thread', channel, threadTs });

          // エージェントで返答生成（統一コンテキスト使用）
          const agentResponse = await runAgent(unifiedContext, userId, userName);

          // 会話履歴に追加（アシスタント応答）
          addToUserHistory(userId, userName, 'assistant', agentResponse, { type: 'thread', channel, threadTs });

          await replyInThread(channel, threadTs, agentResponse);
          return;
        }

        // 新規メッセージの場合 → タスク検出
        console.log(`Channel message from ${userName}: ${userMessage.substring(0, 50)}...`);

        // AIでタスク分析
        const analysis = await analyzeForTask(userMessage, userName);
        console.log('Task analysis:', analysis);

        // 高い確信度でタスクと判断された場合
        if (analysis.isTask && analysis.confidence >= 85) {
          const taskInfo = analysis.task || userMessage.substring(0, 50);
          const assigneeInfo = analysis.assignee ? `担当: ${analysis.assignee}` : '';
          const deadlineInfo = analysis.deadline ? `期限: ${analysis.deadline}` : '';

          const replyMessage = `🤖 オーくんです！このメッセージはタスクっぽいですね。

📋 **検出したタスク**: ${taskInfo}
${assigneeInfo ? `👤 ${assigneeInfo}` : ''}
${deadlineInfo ? `⏰ ${deadlineInfo}` : ''}

タスクとして登録しますか？
• 「登録して」と返信 → タスクに追加
• 「いらない」と返信 → スキップ

（確信度: ${analysis.confidence}%）`;

          await replyInThread(channel, messageTs, replyMessage);
        }

      } catch (error) {
        console.error('Channel message processing error:', error);
      }

      return;
    }
  }

  res.status(200).send('ok');
});

// 手動リマインドトリガー
app.post('/trigger-reminder', async (req, res) => {
  res.json({ status: 'Reminder check started' });
  await checkDeadlinesAndRemind();
});

// タスク一覧API
app.get('/tasks', (req, res) => {
  res.json(tasks);
});

// メンバーマッピングAPI
app.post('/members', (req, res) => {
  const { name, slackId } = req.body;
  if (name && slackId) {
    MEMBER_SLACK_IDS[name] = slackId;
    res.json({ success: true, members: MEMBER_SLACK_IDS });
  } else {
    res.status(400).json({ error: 'name and slackId required' });
  }
});

app.get('/members', (req, res) => {
  res.json(MEMBER_SLACK_IDS);
});

app.get('/', (req, res) => {
  res.send('🤖 オーくん - Slack Task Agent with Gemini Function Calling!');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: true,
    timestamp: new Date().toISOString(),
    taskCount: tasks.urgent.length + tasks.thisWeek.length,
    reminderEnabled: true
  });
});

// 朝の挨拶メッセージを送信
async function sendMorningGreeting() {
  const greetings = [
    'おはよう〜！🌅 今日も一日頑張ろう！',
    'おはよー！☀️ 今日も素敵な一日にしよう！',
    'おはようございます！🌞 今日のタスク、一緒に頑張ろうね！',
    'おはよう！💪 今日も最高の一日にしよう！',
    'グッモーニング！🌈 今日も元気に行こう！',
  ];

  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

  // 今日のタスク概要を追加
  const urgentCount = tasks.urgent.length;
  const thisWeekCount = tasks.thisWeek.length;

  let message = randomGreeting;
  if (urgentCount > 0 || thisWeekCount > 0) {
    message += `\n\n📋 今日のタスク状況:\n`;
    if (urgentCount > 0) message += `🔴 緊急: ${urgentCount}件\n`;
    if (thisWeekCount > 0) message += `🟡 今週: ${thisWeekCount}件\n`;
    message += `\n何か手伝えることがあったら声かけてね！`;
  }

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: 'random',
        text: message
      })
    });
    const result = await response.json();
    console.log('[Morning Greeting]', result.ok ? 'Sent!' : result.error);
  } catch (error) {
    console.error('[Morning Greeting] Error:', error);
  }
}

// 定期リマインド: 毎日18:00
cron.schedule('0 18 * * *', () => {
  console.log('Scheduled reminder check...');
  checkDeadlinesAndRemind();
}, {
  timezone: 'Asia/Tokyo'
});

// 朝の挨拶: 毎日9:00
cron.schedule('0 9 * * *', () => {
  console.log('Sending morning greeting...');
  sendMorningGreeting();
}, {
  timezone: 'Asia/Tokyo'
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 オーくん Agent running on port ${PORT}`);
  console.log(`📋 Tasks: ${tasks.urgent.length} urgent, ${tasks.thisWeek.length} this week`);
  console.log(`⏰ Reminder schedule: 9:00 & 18:00 JST`);
  console.log(`🔧 Task Tools: addTask, completeTask, deleteTask, listTasks, searchTasks, updateTaskStatus, sendReminder`);
  console.log(`📨 Slack Tools: getChannelHistory, searchMessages, readThread`);
});

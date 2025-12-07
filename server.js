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
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// タスクファイルのパス（永続化用）
const TASKS_FILE = path.join(__dirname, 'tasks.json');

// 会話履歴ファイル（ユーザーごと）
const CONVERSATION_FILE = path.join(__dirname, 'conversations.json');
const MAX_HISTORY = 10; // ユーザーごとに最新10件まで保持

// 会話履歴を読み込む
function loadConversations() {
  try {
    if (fs.existsSync(CONVERSATION_FILE)) {
      return JSON.parse(fs.readFileSync(CONVERSATION_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load conversations:', e);
  }
  return {};
}

// 会話履歴を保存
function saveConversations() {
  try {
    fs.writeFileSync(CONVERSATION_FILE, JSON.stringify(conversations, null, 2));
  } catch (e) {
    console.error('Failed to save conversations:', e);
  }
}

// 会話履歴に追加
function addToHistory(userId, role, message) {
  if (!conversations[userId]) {
    conversations[userId] = [];
  }
  conversations[userId].push({
    role, // 'user' or 'assistant'
    content: message,
    timestamp: new Date().toISOString()
  });
  // 最新N件のみ保持
  if (conversations[userId].length > MAX_HISTORY) {
    conversations[userId] = conversations[userId].slice(-MAX_HISTORY);
  }
  saveConversations();
}

// 会話履歴を取得
function getConversationHistory(userId) {
  return conversations[userId] || [];
}

// 会話履歴をプロンプト用にフォーマット
function formatConversationHistory(userId) {
  const history = getConversationHistory(userId);
  if (history.length === 0) return '';

  return '\n\n【直近の会話履歴】\n' +
    history.map(h => `${h.role === 'user' ? 'ユーザー' : 'オーくん'}: ${h.content}`).join('\n');
}

let conversations = loadConversations();

// CEO（佐藤）のSlack ID - リマインド報告先
const CEO_SLACK_ID = 'U06MXBSJKC3';

// メンバーマッピング（担当者名 → Slack User ID）
const MEMBER_SLACK_IDS = {
  '佐藤': 'U06MXBSJKC3',     // 佐藤傑
  '傑': 'U06MXBSJKC3',       // 佐藤傑（同一）
  '大輝': 'U09N2NA1UTW',     // 吉田 大輝
  '河原': 'U098D4VNTV1',     // 河原将太
  '太陽': 'U06MXBSJKC3',     // TODO: 太陽さんのSlack ID要確認
  'シュン': 'U06MXBSJKC3',   // TODO: シュンさんのSlack ID要確認
  // 他のメンバー
  '木口': 'U06P9BL4XGA',     // 木口佳南
  '福本': 'U06THQJEPH8',     // 福本華凛
  '岩本': 'U074YSZ9UJ2',     // 岩本宙士
  '中本': 'U098HS2GK6E',     // 中本和將
  '馬目': 'U09N8R5T4QY',     // 馬目滉
  '甲': 'U09T74ZCEK1',       // 甲大希
  'daiki': 'U09T74ZCEK1',    // 甲大希 Daiki Kabuto
  'Daiki': 'U09T74ZCEK1',    // 甲大希 Daiki Kabuto
  'yusei': 'U09V1JZHKGQ',    // Yusei Tataka
  'Yusei': 'U09V1JZHKGQ',    // Yusei Tataka
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
    urgent: [
      { id: 1, task: "新コミュニティ名の正式決定", assignee: "-", project: "P11_コミュニティ", deadline: "12/9", status: "未着手" },
      { id: 2, task: "コンセプト・社会課題の言語化", assignee: "-", project: "P11_コミュニティ", deadline: "12/9", status: "未着手" }
    ],
    thisWeek: [
      { id: 3, task: "Xアカウントのコンセプト会議", assignee: "佐藤", project: "SNS運用", deadline: "12/8 21:00", status: "未着手" },
      { id: 4, task: "水曜日 開発ミーティング", assignee: "-", project: "開発", deadline: "12/10", status: "未着手" },
      { id: 5, task: "移行方針・料金プランの確定", assignee: "-", project: "P11_コミュニティ", deadline: "12/12", status: "未着手" },
      { id: 6, task: "新Discord構成案 FIX", assignee: "シュン", project: "P11_コミュニティ", deadline: "12/12", status: "未着手" },
      { id: 7, task: "動画DB設計・要件定義", assignee: "太陽", project: "P11_コミュニティ", deadline: "12/14", status: "未着手" },
      { id: 8, task: "アプリMVP実装完了", assignee: "太陽", project: "P11_コミュニティ", deadline: "12/14", status: "未着手" },
      { id: 9, task: "1月〜3月のコンテンツ設計", assignee: "傑", project: "P11_コミュニティ", deadline: "12/14", status: "未着手" }
    ],
    completed: []
  };
}

function saveTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

function getNextId(tasks) {
  const allTasks = [...tasks.urgent, ...tasks.thisWeek, ...tasks.completed];
  return Math.max(...allTasks.map(t => t.id || 0), 0) + 1;
}

let tasks = loadTasks();

// システムプロンプト（アクション検出付き）
function getSystemPrompt() {
  return `あなたはUravation株式会社のタスク管理アシスタントです。
チームメンバー（佐藤、太陽、シュン、大輝、河原、傑など）のタスク管理をサポートします。

現在のタスク一覧:
【緊急】
${tasks.urgent.map(t => `- [${t.id}] ${t.task} (担当:${t.assignee}, 期限:${t.deadline}, ${t.status})`).join('\n')}

【今週】
${tasks.thisWeek.map(t => `- [${t.id}] ${t.task} (担当:${t.assignee}, 期限:${t.deadline}, ${t.status})`).join('\n')}

【完了済み】
${tasks.completed.slice(-5).map(t => `- [${t.id}] ${t.task} ✅`).join('\n') || 'なし'}

## 重要: アクション検出
ユーザーがタスクの追加・完了・削除を依頼した場合、回答の最後に以下のJSON形式でアクションを出力してください:

タスク追加時:
\`\`\`ACTION
{"action":"ADD","task":"タスク名","assignee":"担当者名","deadline":"期限","priority":"urgent/thisWeek"}
\`\`\`

タスク完了時:
\`\`\`ACTION
{"action":"DONE","taskId":タスクID}
\`\`\`

タスク削除時:
\`\`\`ACTION
{"action":"DELETE","taskId":タスクID}
\`\`\`

通常の質問や表示のみの場合はACTIONブロックは不要です。
回答はSlack向けに簡潔に、絵文字を使って見やすく。`;
}

// Gemini APIを呼び出す関数（非同期）
async function callGemini(prompt) {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    throw error;
  }
}

// アクションを検出して実行
function processAction(response) {
  const actionMatch = response.match(/```ACTION\s*([\s\S]*?)```/);
  if (!actionMatch) return { response, actionResult: null };

  try {
    const actionData = JSON.parse(actionMatch[1].trim());
    let actionResult = '';

    switch (actionData.action) {
      case 'ADD':
        const newTask = {
          id: getNextId(tasks),
          task: actionData.task,
          assignee: actionData.assignee || '-',
          project: actionData.project || '未分類',
          deadline: actionData.deadline || '未定',
          status: '未着手'
        };
        if (actionData.priority === 'urgent') {
          tasks.urgent.push(newTask);
        } else {
          tasks.thisWeek.push(newTask);
        }
        saveTasks(tasks);
        actionResult = `✅ タスク「${newTask.task}」を追加しました (ID: ${newTask.id})`;
        break;

      case 'DONE':
        let foundTask = null;
        for (const list of ['urgent', 'thisWeek']) {
          const idx = tasks[list].findIndex(t => t.id === actionData.taskId);
          if (idx !== -1) {
            foundTask = tasks[list].splice(idx, 1)[0];
            foundTask.status = '完了';
            foundTask.completedAt = new Date().toISOString();
            tasks.completed.push(foundTask);
            break;
          }
        }
        if (foundTask) {
          saveTasks(tasks);
          actionResult = `🎉 タスク「${foundTask.task}」を完了にしました！`;
        } else {
          actionResult = `⚠️ タスクID ${actionData.taskId} が見つかりませんでした`;
        }
        break;

      case 'DELETE':
        let deletedTask = null;
        for (const list of ['urgent', 'thisWeek', 'completed']) {
          const idx = tasks[list].findIndex(t => t.id === actionData.taskId);
          if (idx !== -1) {
            deletedTask = tasks[list].splice(idx, 1)[0];
            break;
          }
        }
        if (deletedTask) {
          saveTasks(tasks);
          actionResult = `🗑️ タスク「${deletedTask.task}」を削除しました`;
        } else {
          actionResult = `⚠️ タスクID ${actionData.taskId} が見つかりませんでした`;
        }
        break;
    }

    const cleanResponse = response.replace(/```ACTION[\s\S]*?```/g, '').trim();
    return { response: cleanResponse, actionResult };

  } catch (e) {
    console.error('Action parse error:', e);
    return { response, actionResult: null };
  }
}

// Slack DMを送信
async function sendSlackDM(userId, message) {
  try {
    // DMチャンネルを開く
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

    // メッセージを送信
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

// Geminiでリマインドメッセージを生成
async function generateReminderMessage(assignee, taskList) {
  const prompt = `あなたはUravationのタスク管理AIアシスタントです。
${assignee}さんに期限が近いタスクのリマインドDMを送ります。

期限が近いタスク:
${taskList.map(t => `- ${t.task}（期限: ${t.deadline}）`).join('\n')}

フレンドリーで励ましになるような、でもプレッシャーをかけすぎない自然なリマインドメッセージを作成してください。
固定文章ではなく、タスクの内容に合わせて少しバリエーションをつけて。
絵文字も適度に使ってください。150文字以内で。`;

  try {
    return await callGemini(prompt);
  } catch (e) {
    // フォールバック
    return `📋 ${assignee}さん、お疲れさまです！\n期限が近いタスクがあります:\n${taskList.map(t => `• ${t.task}（${t.deadline}）`).join('\n')}\nファイトです！💪`;
  }
}

// 期限チェックとリマインド送信
async function checkDeadlinesAndRemind() {
  console.log('Checking deadlines...');

  const now = new Date();
  const allTasks = [...tasks.urgent, ...tasks.thisWeek];

  // 担当者ごとにタスクをグループ化
  const tasksByAssignee = {};

  for (const task of allTasks) {
    if (task.status === '完了' || task.assignee === '-') continue;

    // 期限をパース（例: "12/9", "12/8 21:00"）
    const deadlineStr = task.deadline;
    const match = deadlineStr.match(/(\d+)\/(\d+)/);
    if (!match) continue;

    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    const deadlineDate = new Date(now.getFullYear(), month - 1, day);

    // 期限までの日数を計算
    const daysUntil = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

    // 2日以内のタスクをリマインド対象に
    if (daysUntil <= 2 && daysUntil >= 0) {
      if (!tasksByAssignee[task.assignee]) {
        tasksByAssignee[task.assignee] = [];
      }
      tasksByAssignee[task.assignee].push(task);
    }
  }

  // 送信したリマインドを記録（CEO報告用）
  const sentReminders = [];

  // 各担当者にリマインドDMを送信
  for (const [assignee, taskList] of Object.entries(tasksByAssignee)) {
    const slackId = MEMBER_SLACK_IDS[assignee];
    if (!slackId) {
      console.log(`No Slack ID for: ${assignee}`);
      continue;
    }

    // 自分自身（CEO）へのリマインドは報告不要
    if (slackId === CEO_SLACK_ID) {
      const message = generateReminderMessage(assignee, taskList);
      await sendSlackDM(slackId, message);
    } else {
      const message = generateReminderMessage(assignee, taskList);
      const sent = await sendSlackDM(slackId, message);
      if (sent) {
        sentReminders.push({
          assignee,
          tasks: taskList.map(t => t.task)
        });
      }
    }

    // Rate limit対策
    await new Promise(r => setTimeout(r, 1000));
  }

  // CEOに送信報告
  if (sentReminders.length > 0) {
    const reportLines = sentReminders.map(r =>
      `• ${r.assignee}さん: ${r.tasks.join(', ')}`
    );
    const ceoReport = `📬 リマインド送信報告\n\n以下のメンバーにリマインドDMを送信しました:\n${reportLines.join('\n')}`;
    await sendSlackDM(CEO_SLACK_ID, ceoReport);
  }

  console.log('Reminder check completed');
}

// 非同期でSlackに返信
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

// Slack Slash Command ハンドラー
app.post('/slack/command', async (req, res) => {
  const { text, user_name, command, response_url } = req.body;
  console.log(`Command: ${command}, Text: ${text}, User: ${user_name}`);

  res.json({
    response_type: "in_channel",
    text: `⏳ 処理中... ${user_name}さん: ${text || 'today'}`
  });

  try {
    const prompt = `${getSystemPrompt()}

ユーザー(${user_name})からのリクエスト: ${text || 'today'}

Slack形式で回答してください。タスク操作の依頼があればACTIONブロックも出力してください。`;

    const geminiResponse = await callGemini(prompt);
    const { response: cleanResponse, actionResult } = processAction(geminiResponse);

    let finalResponse = cleanResponse;
    if (actionResult) {
      finalResponse += `\n\n---\n${actionResult}`;
    }

    if (response_url) {
      await sendDelayedResponse(response_url, finalResponse);
    }
  } catch (error) {
    console.error('Error processing:', error);
    if (response_url) {
      await sendDelayedResponse(response_url, `❌ エラーが発生しました: ${error.message}`);
    }
  }
});

// Slack Events API ハンドラー（DMでの会話用）
app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  // URL検証（Slack Event Subscriptions設定時）
  if (type === 'url_verification') {
    return res.json({ challenge });
  }

  // イベントコールバック
  if (type === 'event_callback' && event) {
    // ボット自身のメッセージは無視
    if (event.bot_id || event.subtype === 'bot_message') {
      return res.status(200).send('ok');
    }

    // DMでのメッセージイベント
    if (event.type === 'message' && event.channel_type === 'im') {
      const userMessage = event.text;
      const userId = event.user;

      console.log(`DM from ${userId}: ${userMessage}`);

      // 即座に200を返す（3秒タイムアウト対策）
      res.status(200).send('ok');

      try {
        // ユーザー名を取得
        const userInfoRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
          headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
        });
        const userInfo = await userInfoRes.json();
        const userName = userInfo.ok ? (userInfo.user.real_name || userInfo.user.name) : 'ユーザー';

        // 会話履歴に追加（ユーザーのメッセージ）
        addToHistory(userId, 'user', userMessage);

        // 会話履歴を取得してプロンプトに含める
        const historyContext = formatConversationHistory(userId);

        // Geminiで回答を生成（非同期版を使用 - 同時リクエスト対応）
        const prompt = `${getSystemPrompt()}
${historyContext}

ユーザー(${userName})からの最新メッセージ: ${userMessage}

Slack DMでの会話なので、フレンドリーに回答してください。
会話履歴がある場合は、前の会話を踏まえて回答してください。
タスク操作の依頼があればACTIONブロックも出力してください。`;

        const geminiResponse = await callGemini(prompt);
        const { response: cleanResponse, actionResult } = processAction(geminiResponse);

        let finalResponse = cleanResponse;
        if (actionResult) {
          finalResponse += `\n\n---\n${actionResult}`;
        }

        // 会話履歴に追加（アシスタントの応答）
        addToHistory(userId, 'assistant', finalResponse);

        // DMに返信
        await sendSlackDM(userId, finalResponse);

      } catch (error) {
        console.error('DM processing error:', error);
        await sendSlackDM(userId, `❌ エラーが発生しました: ${error.message}`);
      }

      return;
    }
  }

  res.status(200).send('ok');
});

// 手動リマインドトリガー（テスト用）
app.post('/trigger-reminder', async (req, res) => {
  res.json({ status: 'Reminder check started' });
  await checkDeadlinesAndRemind();
});

// タスク一覧API
app.get('/tasks', (req, res) => {
  res.json(tasks);
});

// メンバーマッピング更新API
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
  res.send('Slack Task Bot with AI Reminders!');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    taskCount: tasks.urgent.length + tasks.thisWeek.length,
    reminderEnabled: true
  });
});

// 定期リマインド: 毎日9:00と18:00にチェック
cron.schedule('0 9,18 * * *', () => {
  console.log('Scheduled reminder check...');
  checkDeadlinesAndRemind();
}, {
  timezone: 'Asia/Tokyo'
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Tasks: ${tasks.urgent.length} urgent, ${tasks.thisWeek.length} this week`);
  console.log('Reminder schedule: 9:00 & 18:00 JST');
});

import { NextResponse } from 'next/server';

export interface Task {
  id: string;
  task: string;
  assignee: string;
  project: string;
  deadline: string;
  priority: 'urgent' | 'thisWeek';
  status: '未着手' | '進行中' | 'レビュー中' | '完了';
  created_at: string;
  completed_at: string;
  created_by: string;
}

export async function GET() {
  try {
    // Express サーバーからタスクを取得
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const response = await fetch(`${apiUrl}/api/tasks`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // リアルタイムデータ取得のためキャッシュ無効化
    });

    if (!response.ok) {
      console.error('Express API error:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch tasks from server' },
        { status: 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface Task {
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

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    try {
      setLoading(true);
      const response = await fetch('/api/tasks');
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const getPriorityBadge = (priority: string) => {
    if (priority === 'urgent') {
      return <Badge variant="destructive">🔴 緊急</Badge>;
    }
    return <Badge variant="secondary">🟡 今週</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      '未着手': 'outline',
      '進行中': 'default',
      'レビュー中': 'secondary',
      '完了': 'secondary',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const incompleteTasks = tasks.filter(t => t.status !== '完了');
  const completedTasks = tasks.filter(t => t.status === '完了');
  const urgentTasks = incompleteTasks.filter(t => t.priority === 'urgent');

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">📊 オーくんダッシュボード</h1>
            <p className="text-muted-foreground mt-2">Uravation タスク管理システム</p>
          </div>
        </div>

        {/* 統計カード */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">全タスク</CardTitle>
              <span className="text-2xl">📋</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tasks.length}件</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">未完了</CardTitle>
              <span className="text-2xl">⏳</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{incompleteTasks.length}件</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">緊急</CardTitle>
              <span className="text-2xl">🔥</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{urgentTasks.length}件</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">完了</CardTitle>
              <span className="text-2xl">✅</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedTasks.length}件</div>
            </CardContent>
          </Card>
        </div>

        {/* エラー表示 */}
        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">エラー</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* タスク一覧 */}
        <Card>
          <CardHeader>
            <CardTitle>タスク一覧</CardTitle>
            <CardDescription>全{tasks.length}件のタスク</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                タスクがありません 🎉
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>優先度</TableHead>
                      <TableHead>タスク</TableHead>
                      <TableHead>担当者</TableHead>
                      <TableHead>プロジェクト</TableHead>
                      <TableHead>期限</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>作成日</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow key={task.id} className={task.status === '完了' ? 'opacity-50' : ''}>
                        <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                        <TableCell className="font-medium">{task.task}</TableCell>
                        <TableCell>{task.assignee || '未割当'}</TableCell>
                        <TableCell>{task.project || '未分類'}</TableCell>
                        <TableCell>{task.deadline || '未定'}</TableCell>
                        <TableCell>{getStatusBadge(task.status)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {task.created_at
                            ? format(new Date(task.created_at), 'MM/dd HH:mm', { locale: ja })
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

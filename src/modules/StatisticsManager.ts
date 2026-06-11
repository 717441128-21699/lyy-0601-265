import { Task, DailyPlan, CheckInRecord, EfficiencyScore, CalendarBlock, Goal } from '../types';
import { generateId, isSameDay, startOfDay, endOfDay, getPriorityWeight, clamp, formatDate } from '../utils';

export class StatisticsManager {
  private checkIns: Map<string, CheckInRecord> = new Map();

  generateDailyPlan(
    date: Date,
    tasks: Task[],
    calendarBlocks: CalendarBlock[]
  ): DailyPlan {
    const dayTasks = tasks.filter((t) => {
      if (t.status === 'completed' || t.status === 'cancelled') return false;
      if (t.dueDate && isSameDay(t.dueDate, date)) return true;
      if (t.startDate && isSameDay(t.startDate, date)) return true;
      return false;
    });

    const dayBlocks = calendarBlocks.filter((b) => isSameDay(b.startTime, date));

    const totalEstimatedMinutes = dayTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);

    const highPriorityCount = dayTasks.filter((t) => t.priority === 'high' || t.priority === 'urgent').length;
    const focusScore = clamp(
      Math.round(60 + highPriorityCount * 10 + (dayTasks.length > 5 ? 10 : 0)),
      0,
      100
    );

    return {
      date,
      tasks: dayTasks,
      calendarBlocks: dayBlocks,
      totalEstimatedMinutes,
      focusScore,
    };
  }

  generateWeeklyPlans(
    startDate: Date,
    tasks: Task[],
    calendarBlocks: CalendarBlock[]
  ): DailyPlan[] {
    const plans: DailyPlan[] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      plans.push(this.generateDailyPlan(date, tasks, calendarBlocks));
    }

    return plans;
  }

  checkIn(params: {
    date?: Date;
    completedTasks: string[];
    completedMinutes: number;
    plannedMinutes?: number;
    mood?: string;
    note?: string;
  }): CheckInRecord {
    const now = new Date();
    const date = params.date || now;
    const dateKey = formatDate(date);

    const existingCheckIn = this.getCheckInByDate(date);
    if (existingCheckIn) {
      const updated: CheckInRecord = {
        ...existingCheckIn,
        completedTasks: Array.from(new Set([...existingCheckIn.completedTasks, ...params.completedTasks])),
        completedMinutes: existingCheckIn.completedMinutes + params.completedMinutes,
        plannedMinutes: params.plannedMinutes ?? existingCheckIn.plannedMinutes,
        mood: params.mood || existingCheckIn.mood,
        note: params.note || existingCheckIn.note,
      };
      this.checkIns.set(existingCheckIn.id, updated);
      return updated;
    }

    const checkIn: CheckInRecord = {
      id: generateId(),
      date: startOfDay(date),
      completedTasks: params.completedTasks,
      completedMinutes: params.completedMinutes,
      plannedMinutes: params.plannedMinutes || 0,
      mood: params.mood,
      note: params.note,
      createdAt: now,
    };

    this.checkIns.set(checkIn.id, checkIn);
    return checkIn;
  }

  getCheckIn(id: string): CheckInRecord | undefined {
    return this.checkIns.get(id);
  }

  getCheckInByDate(date: Date): CheckInRecord | undefined {
    return Array.from(this.checkIns.values()).find((c) => isSameDay(c.date, date));
  }

  getAllCheckIns(): CheckInRecord[] {
    return Array.from(this.checkIns.values()).sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );
  }

  getCheckInsForRange(startDate: Date, endDate: Date): CheckInRecord[] {
    return this.getAllCheckIns().filter(
      (c) => c.date >= startOfDay(startDate) && c.date <= endOfDay(endDate)
    );
  }

  calculateEfficiencyScore(
    date: Date,
    tasks: Task[],
    goals?: Goal[]
  ): EfficiencyScore {
    const dayTasks = tasks.filter((t) => {
      if (t.dueDate && isSameDay(t.dueDate, date)) return true;
      if (t.completedAt && isSameDay(t.completedAt, date)) return true;
      return false;
    });

    const totalTasks = dayTasks.length;
    const completedTasks = dayTasks.filter((t) => t.status === 'completed').length;
    const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

    const plannedMinutes = dayTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    const actualMinutes = dayTasks
      .filter((t) => t.actualMinutes)
      .reduce((sum, t) => sum + (t.actualMinutes || 0), 0);

    const timeAccuracy = plannedMinutes > 0
      ? 1 - Math.abs(actualMinutes - plannedMinutes) / plannedMinutes
      : 1;

    const highPriorityTasks = dayTasks.filter(
      (t) => t.priority === 'high' || t.priority === 'urgent'
    );
    const completedHighPriority = highPriorityTasks.filter(
      (t) => t.status === 'completed'
    ).length;
    const focusConsistency = highPriorityTasks.length > 0
      ? completedHighPriority / highPriorityTasks.length
      : 1;

    const deferredTasks = dayTasks.filter((t) => t.deferRecords.length > 0);
    const deferredCount = deferredTasks.length;

    let goalProgressScore = 1;
    if (goals && goals.length > 0) {
      const dayGoalProgress = goals.reduce((sum, g) => sum + g.progress, 0) / goals.length;
      goalProgressScore = dayGoalProgress / 100;
    }

    const taskCompletionScore = completionRate * 30;
    const timeAccuracyScore = clamp(timeAccuracy, 0, 1) * 25;
    const focusConsistencyScore = focusConsistency * 25;
    const goalProgressFinalScore = goalProgressScore * 20;

    const totalScore = Math.round(
      taskCompletionScore + timeAccuracyScore + focusConsistencyScore + goalProgressFinalScore
    );

    const focusMinutes = actualMinutes || Math.round(plannedMinutes * completionRate);

    return {
      date,
      score: clamp(totalScore, 0, 100),
      completionRate: Math.round(completionRate * 100),
      focusMinutes,
      taskCount: totalTasks,
      deferredCount,
      details: {
        taskCompletion: Math.round(completionRate * 100),
        timeAccuracy: Math.round(clamp(timeAccuracy, 0, 1) * 100),
        focusConsistency: Math.round(focusConsistency * 100),
        goalProgress: Math.round(goalProgressScore * 100),
      },
    };
  }

  getStreak(): number {
    const checkIns = this.getAllCheckIns();
    if (checkIns.length === 0) return 0;

    let streak = 0;
    let currentDate = new Date();

    for (let i = 0; i < checkIns.length; i++) {
      const checkInDate = new Date(checkIns[i].date);

      if (isSameDay(checkInDate, currentDate)) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        const yesterday = new Date(currentDate);
        yesterday.setDate(yesterday.getDate() - 1);

        if (isSameDay(checkInDate, yesterday)) {
          streak++;
          currentDate = yesterday;
        } else {
          break;
        }
      }
    }

    return streak;
  }

  getTotalStats(tasks: Task[]): {
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    totalEstimatedMinutes: number;
    totalActualMinutes: number;
    byPriority: Record<string, { total: number; completed: number }>;
    byTag: Record<string, { total: number; completed: number }>;
  } {
    const allTasks = tasks;
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter((t) => t.status === 'completed').length;
    const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

    const totalEstimatedMinutes = allTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    const totalActualMinutes = allTasks
      .filter((t) => t.actualMinutes)
      .reduce((sum, t) => sum + (t.actualMinutes || 0), 0);

    const byPriority: Record<string, { total: number; completed: number }> = {};
    const byTag: Record<string, { total: number; completed: number }> = {};

    allTasks.forEach((task) => {
      if (!byPriority[task.priority]) {
        byPriority[task.priority] = { total: 0, completed: 0 };
      }
      byPriority[task.priority].total++;
      if (task.status === 'completed') {
        byPriority[task.priority].completed++;
      }

      task.tags.forEach((tag) => {
        if (!byTag[tag]) {
          byTag[tag] = { total: 0, completed: 0 };
        }
        byTag[tag].total++;
        if (task.status === 'completed') {
          byTag[tag].completed++;
        }
      });
    });

    return {
      totalTasks,
      completedTasks,
      completionRate: Math.round(completionRate * 100),
      totalEstimatedMinutes,
      totalActualMinutes,
      byPriority,
      byTag,
    };
  }
}

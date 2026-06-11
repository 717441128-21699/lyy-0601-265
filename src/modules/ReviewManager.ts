import { WeeklyReview, Task, Goal } from '../types';
import {
  startOfWeek,
  endOfWeek,
  isSameWeek,
  getPriorityWeight,
  sortTasksByPriority,
  formatDate,
} from '../utils';

export class ReviewManager {
  generateWeeklyReview(
    weekDate: Date,
    tasks: Task[],
    goals?: Goal[]
  ): WeeklyReview {
    const startDate = startOfWeek(weekDate);
    const endDate = endOfWeek(weekDate);

    const weekTasks = tasks.filter((t) => {
      if (t.dueDate && isSameWeek(t.dueDate, weekDate)) return true;
      if (t.completedAt && isSameWeek(t.completedAt, weekDate)) return true;
      if (t.createdAt && t.createdAt >= startDate && t.createdAt <= endDate) return true;
      return false;
    });

    const totalTasks = weekTasks.length;
    const completedTasks = weekTasks.filter((t) => t.status === 'completed').length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const totalEstimatedMinutes = weekTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    const totalActualMinutes = weekTasks
      .filter((t) => t.actualMinutes)
      .reduce((sum, t) => sum + (t.actualMinutes || 0), 0);

    const deferredTasks = weekTasks.filter((t) => t.deferRecords.length > 0);

    const sortedTasks = sortTasksByPriority(weekTasks);
    const topTasks = sortedTasks.slice(0, 5);

    const goalProgress = goals
      ? goals.map((g) => ({
          goalId: g.id,
          title: g.title,
          progress: g.progress,
        }))
      : [];

    const insights = this.generateInsights(weekTasks, goals || []);
    const suggestions = this.generateSuggestions(weekTasks, goals || []);

    const efficiencyScore = this.calculateWeeklyEfficiency(weekTasks, goals || []);

    return {
      startDate,
      endDate,
      totalTasks,
      completedTasks,
      completionRate,
      totalEstimatedMinutes,
      totalActualMinutes,
      efficiencyScore,
      topTasks,
      deferredTasks,
      goalProgress,
      insights,
      suggestions,
    };
  }

  private generateInsights(tasks: Task[], goals: Goal[]): string[] {
    const insights: string[] = [];

    if (tasks.length === 0) {
      insights.push('本周没有安排任务，建议规划一些有意义的事情。');
      return insights;
    }

    const completionRate = tasks.length > 0
      ? tasks.filter((t) => t.status === 'completed').length / tasks.length
      : 0;

    if (completionRate >= 0.8) {
      insights.push('本周任务完成率很高，继续保持这种高效状态！');
    } else if (completionRate >= 0.5) {
      insights.push('本周完成了一半以上的任务，还有提升空间。');
    } else {
      insights.push('本周任务完成率偏低，需要分析原因并调整计划。');
    }

    const highPriorityTasks = tasks.filter(
      (t) => t.priority === 'high' || t.priority === 'urgent'
    );
    const completedHighPriority = highPriorityTasks.filter(
      (t) => t.status === 'completed'
    ).length;

    if (highPriorityTasks.length > 0) {
      const highPriorityRate = completedHighPriority / highPriorityTasks.length;
      if (highPriorityRate >= 0.8) {
        insights.push('高优先级任务完成度很好，时间分配合理。');
      } else {
        insights.push('高优先级任务完成度不足，建议优先处理重要事项。');
      }
    }

    const deferredCount = tasks.filter((t) => t.deferRecords.length > 0).length;
    if (deferredCount > 0) {
      insights.push(`本周有 ${deferredCount} 个任务被延期，注意避免拖延。`);
    }

    const tasksWithSteps = tasks.filter((t) => t.steps.length > 0);
    if (tasksWithSteps.length > 0) {
      insights.push(`有 ${tasksWithSteps.length} 个任务进行了步骤拆分，有助于降低执行难度。`);
    }

    if (goals.length > 0) {
      const avgProgress = goals.reduce((sum, g) => sum + g.progress, 0) / goals.length;
      insights.push(`目标平均进度为 ${Math.round(avgProgress)}%，${avgProgress >= 50 ? '进展不错' : '需要加把劲'}。`);
    }

    return insights;
  }

  private generateSuggestions(tasks: Task[], goals: Goal[]): string[] {
    const suggestions: string[] = [];

    if (tasks.length === 0) {
      suggestions.push('建议下周规划3-5个核心任务，保持适度的工作节奏。');
      return suggestions;
    }

    const completionRate = tasks.length > 0
      ? tasks.filter((t) => t.status === 'completed').length / tasks.length
      : 0;

    if (completionRate < 0.5) {
      suggestions.push('任务完成率偏低，建议减少任务数量，聚焦重点。');
      suggestions.push('尝试使用番茄工作法，提升专注力和执行力。');
    }

    const deferredTasks = tasks.filter((t) => t.deferRecords.length > 0);
    if (deferredTasks.length > 2) {
      suggestions.push('延期任务较多，建议评估任务难度，合理分配时间。');
      suggestions.push('可以尝试将大任务拆分为更小的步骤，逐步推进。');
    }

    const highPriorityCount = tasks.filter(
      (t) => t.priority === 'high' || t.priority === 'urgent'
    ).length;
    if (highPriorityCount > 5) {
      suggestions.push('高优先级任务过多，建议重新评估优先级，避免精力分散。');
    }

    const tasksWithEstimates = tasks.filter((t) => t.estimatedMinutes > 0);
    if (tasksWithEstimates.length < tasks.length / 2) {
      suggestions.push('建议为所有任务估算耗时，便于更好地安排日程。');
    }

    if (goals.length > 0 && goals.some((g) => g.progress < 20)) {
      suggestions.push('部分目标进展缓慢，建议将目标拆解为可执行的小任务。');
    }

    if (tasks.some((t) => t.steps.length === 0 && t.estimatedMinutes > 60)) {
      suggestions.push('超过1小时的大任务建议拆分为多个步骤，降低执行门槛。');
    }

    return suggestions;
  }

  private calculateWeeklyEfficiency(tasks: Task[], goals: Goal[]): number {
    if (tasks.length === 0) return 0;

    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const completionRate = completedTasks / tasks.length;

    const highPriorityTasks = tasks.filter(
      (t) => t.priority === 'high' || t.priority === 'urgent'
    );
    const completedHighPriority = highPriorityTasks.filter(
      (t) => t.status === 'completed'
    ).length;
    const highPriorityRate = highPriorityTasks.length > 0
      ? completedHighPriority / highPriorityTasks.length
      : 1;

    const deferredRate = tasks.filter((t) => t.deferRecords.length > 0).length / tasks.length;

    let goalScore = 1;
    if (goals.length > 0) {
      const avgProgress = goals.reduce((sum, g) => sum + g.progress, 0) / goals.length;
      goalScore = avgProgress / 100;
    }

    const score =
      completionRate * 40 +
      highPriorityRate * 30 +
      (1 - deferredRate) * 15 +
      goalScore * 15;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  getWeeklySummary(weekDate: Date, tasks: Task[]): {
    dateRange: string;
    total: number;
    completed: number;
    rate: number;
    byPriority: Record<string, { total: number; completed: number }>;
  } {
    const startDate = startOfWeek(weekDate);
    const endDate = endOfWeek(weekDate);

    const weekTasks = tasks.filter((t) => {
      if (t.dueDate && t.dueDate >= startDate && t.dueDate <= endDate) return true;
      if (t.completedAt && t.completedAt >= startDate && t.completedAt <= endDate) return true;
      return false;
    });

    const byPriority: Record<string, { total: number; completed: number }> = {};
    weekTasks.forEach((task) => {
      if (!byPriority[task.priority]) {
        byPriority[task.priority] = { total: 0, completed: 0 };
      }
      byPriority[task.priority].total++;
      if (task.status === 'completed') {
        byPriority[task.priority].completed++;
      }
    });

    const completed = weekTasks.filter((t) => t.status === 'completed').length;

    return {
      dateRange: `${formatDate(startDate)} ~ ${formatDate(endDate)}`,
      total: weekTasks.length,
      completed,
      rate: weekTasks.length > 0 ? Math.round((completed / weekTasks.length) * 100) : 0,
      byPriority,
    };
  }
}
